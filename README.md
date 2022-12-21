# Appointment_scheduling_app

This repository for the appointment scheduling app has 3 APIs.

1.  Free Slots
    Params:
    - Date
    - TimeZone
      The API takes two query params and returns all the free slots of the doctor on that day.
      URL : localhost:3000/?date=2022-12-16&timezone=Asia/Karachi
2.  Create Event
    Params:

    - StartTime
    - Duration
      This post API takes two parameters in the body and creates the event in the database.

           URL: localhost:3000/create-event.
           And the parameters in the body should be passed in json format and look like this
           {
          "startTime": "2022-12-22T09:00:00+07:00",
          "duration": "90"
          }

3.  Get Events
    Params:

    - StartDate
    - EndDate
      This is another post API that takes 2 parameters, starting and ending date. And it returns all the booked events, between the given dates.

    URL: localhost:3000/all-events
    Parameters in the body should be in Json format and look like this
    {
    "startDate": "2022-03-25",
    "endDate": "2022-12-17"
    }

Add your own cert.json to run this code.
