import express from "express";
const dayjs = require("dayjs");
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Config } from "./types";
initializeApp({
  credential: cert("./cert.json"),
});
var isSameOrAfter = require("dayjs/plugin/isSameOrAfter");
dayjs.extend(isSameOrAfter);
var isSameOrBefore = require("dayjs/plugin/isSameOrBefore");
dayjs.extend(isSameOrBefore);
var utc = require("dayjs/plugin/utc");
var timezone = require("dayjs/plugin/timezone"); // dependent on utc plugin
dayjs.extend(utc);
dayjs.extend(timezone);

const db = getFirestore();
const app = express();
const port = 3000;
const config = {
  startHours: 10,
  endHours: 17,
  duration: 60,
  timezone: "America/Los_Angeles",
};
app.use(express.json());
app.get("/", async (req, res) => {
  const userDate = req.query.date as string;
  const timeZone = req.query.timezone as string;
  if (userDate && timeZone) {
    db.collection("events")
      .get()
      .then((querySnapshot) => {
        // Create a list of events from the query snapshot
        const events = querySnapshot.docs.map((doc) => doc.data());
        // Create a list of available slots based on the events and the static config
        const availableSlots = getAvailableSlots(
          events,
          config,
          userDate,
          timeZone
        );

        res.json(availableSlots);
      })
      .catch((error) => {
        console.log("Error getting events from firestore:", error);
        res.status(500).send("Error getting events from firestore");
      });
  }
});

app.post("/create-event", async (req, res) => {
  if (!req.body || !req.body.startTime || !req.body.duration) {
    return res
      .status(400)
      .send("Must include startTime and duration arguments.");
  }
  const startTime = req.body.startTime;
  const duration = Number(req.body.duration);

  const currentTime = dayjs.utc();
  const newTime = dayjs(startTime).utc();
  const doctorStartTime = dayjs
    .tz(dayjs(startTime).utc().format("YYYY-MM-DD"), config.timezone)
    .hour(config.startHours);
  const doctorEndTime = dayjs
    .tz(dayjs(startTime).utc().format("YYYY-MM-DD"), config.timezone)
    .hour(config.endHours);

  if (
    newTime.isBefore(currentTime) ||
    newTime.isBefore(doctorStartTime) ||
    newTime.isAfter(doctorEndTime)
  ) {
    return res.send("Invalid Time");
  }
  try {
    const querySnapshot = await db.collection("events").get();
    const events = querySnapshot.docs.map((doc) => doc.data());

    const newEvent = createEvent(startTime, events, duration);
    if (newEvent) {
      const response = await db.collection("events").doc().set(newEvent);
      res.send(response);
    } else {
      res.status(422).send("Event already exists");
    }
  } catch (error) {
    console.log("Error getting events from firestore:", error);
    res.status(500).send("Error getting events from firestore");
  }
});

app.post("/all-events", async (req, res) => {
  if (!req.body || !req.body.startDate || !req.body.endDate) {
    return res.status(400).send("Must include startTime argument.");
  }
  const startDate = new Date(req.body.startDate);
  const endDate = new Date(req.body.endDate);
  try {
    const querySnapshot = await db.collection("events").get();
    const events = querySnapshot.docs.map((doc) => doc.data());
    const filteredEvents = getFilteredEvents(events, startDate, endDate);
    res.send(filteredEvents);
  } catch (error) {
    console.log("Error getting events from firestore:", error);
    res.status(500).send("Error getting events from firestore");
  }
});
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});

function getAvailableSlots(
  events: FirebaseFirestore.DocumentData[],
  config: Config,
  userDate: string,
  timeZone: string
) {
  const dayBefore = dayjs(userDate).subtract(1, "day").format("YYYY-MM-DD");
  const dayAfter = dayjs(userDate).add(1, "day").format("YYYY-MM-DD");
  const allSlots: string[] = [];
  const dayBeforeEvents: FirebaseFirestore.DocumentData[] = filterEventsbyDate(
    events,
    dayBefore
  );
  allSlots.push(
    ...getDailySlots(dayBeforeEvents, config, dayBefore, timeZone, userDate)
  );
  const userDateEvents: FirebaseFirestore.DocumentData[] = filterEventsbyDate(
    events,
    userDate
  );
  allSlots.push(
    ...getDailySlots(userDateEvents, config, userDate, timeZone, userDate)
  );
  const dayAfterEvents: FirebaseFirestore.DocumentData[] = filterEventsbyDate(
    events,
    dayAfter
  );
  allSlots.push(
    ...getDailySlots(dayAfterEvents, config, dayAfter, timeZone, userDate)
  );
  return allSlots;
}

// Function to calculate the available slots based on the events and the static config
function getDailySlots(
  events: FirebaseFirestore.DocumentData[],
  config: Config,
  currentDate: string,
  timeZone: string,
  userDate: string
) {
  // Create a list of available slots
  const availableSlots: string[] = [];
  const startTime = dayjs
    .tz(currentDate, config.timezone)
    .hour(config.startHours);
  const endTime = dayjs.tz(currentDate, config.timezone).hour(config.endHours);
  let currentTime = startTime;
  // Loop through the events and add the available slots to the list
  while (currentTime <= endTime) {
    // Check if there is an event at the current time
    const event = events.find(
      (event: FirebaseFirestore.DocumentData) =>
        dayjs(event.startTime).tz(config.timezone).isSame(currentTime) ||
        dayjs(event.endTime).tz(config.timezone).isAfter(currentTime)
    );
    // If there is no event at the current time, add it to the list of available slots
    if (
      !event &&
      dayjs.utc(currentTime).tz(timeZone).format("YYYY-MM-DD") === userDate
    ) {
      availableSlots.push(
        dayjs.utc(currentTime).tz(timeZone).format("YYYY-MM-DDTHH:mm:ssZ")
      );
    }
    // Increment the current time by the duration
    currentTime = currentTime.add(config.duration, "m");
  }
  return availableSlots;
}

function createEvent(
  startTime: string,
  events: FirebaseFirestore.DocumentData[],
  duration: number
) {
  const event = events.find(
    (event: FirebaseFirestore.DocumentData) =>
      dayjs(event.startTime).isSame(startTime) ||
      dayjs(startTime).isBefore(dayjs(event.endTime))
  );
  let newEvent;
  if (!event) {
    newEvent = {
      date: dayjs(startTime).utc().format("YYYY-MM-DD"),
      startTime: dayjs(startTime).utc().format("YYYY-MM-DDTHH:mm:ssZ"),
      endTime: dayjs(startTime)
        .add(duration, "m")
        .utc()
        .format("YYYY-MM-DDTHH:mm:ssZ"),
      duration: duration,
    };
  }
  return newEvent;
}

function getFilteredEvents(
  events: FirebaseFirestore.DocumentData[],
  startDate: Date,
  endDate: Date
) {
  const filteredEvents = events.filter(
    (event: FirebaseFirestore.DocumentData) =>
      dayjs(event.startTime).isSameOrAfter(dayjs(startDate)) &&
      dayjs(event.startTime).isBefore(dayjs(endDate).add(1, "day"))
  );

  return filteredEvents;
}

function filterEventsbyDate(
  events: FirebaseFirestore.DocumentData[],
  userDate: string
) {
  const filteredEvents = events.filter(
    (event: FirebaseFirestore.DocumentData) => event.date === userDate
  );
  return filteredEvents;
}
