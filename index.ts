import express from "express";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Config } from "./types";
initializeApp({
  credential: cert("./cert.json"),
});
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
  try {
    const querySnapshot = await db.collection("events").get();
    const events = querySnapshot.docs.map((doc) => doc.data());
    const newEvent = createEvent(startTime, events, duration);
    if (newEvent) {
      const response = await db.collection("events").doc().set(newEvent);
      res.send(response);
    } else {
      res.send("Event already exists");
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
// Function to calculate the available slots based on the events and the static config
function getAvailableSlots(
  events: FirebaseFirestore.DocumentData[],
  config: Config,
  userDate: string,
  timeZone: string
) {
  // Create a list of available slots
  const availableSlots: Date[] = [];
  // Get the start and end times based on the static config
  const startTime = new Date(userDate);
  startTime.setHours(config.startHours, 0, 0, 0);
  const endTime = new Date(userDate);
  endTime.setHours(config.endHours, 0, 0, 0);
  // Set the current time to the start time
  let currentTime = startTime;
  // Loop through the events and add the available slots to the list
  while (currentTime <= endTime) {
    // Check if there is an event at the current time
    const event = events.find(
      (event: FirebaseFirestore.DocumentData) =>
        event.startTime.toDate().getTime() === currentTime.getTime() ||
        event.endTime.toDate().getTime() > currentTime.getTime()
    );
    // If there is no event at the current time, add it to the list of available slots
    if (!event) {
      // availableSlots.push(currentTime.toISOString());
      availableSlots.push(convertTZ(currentTime, timeZone));
    }
    // Increment the current time by the duration
    currentTime = new Date(currentTime.getTime() + config.duration * 60 * 1000);
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
      event.startTime.toDate().getTime() === new Date(startTime).getTime()
  );
  let newEvent;
  if (!event) {
    newEvent = {
      startTime: new Date(startTime),
      endTime: new Date(new Date(startTime).getTime() + duration * 60 * 1000),
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
      event.startTime.toDate().getTime() >= startDate.getTime() &&
      event.endTime.toDate().getTime() <= endDate.getTime()
  );

  return filteredEvents;
}

function convertTZ(date: Date, tzString: string) {
  return new Date(
    date.toLocaleString("en-US", {
      timeZone: tzString,
    })
  );
}
