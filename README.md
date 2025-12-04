# Mobile App Overview

This app, Venture, is an app that is designed to pull in numerous date/activtiy ideas from the web and organize them into a database. Then, when a user enters their criteria for their perfect date the app will algorithmically select activities and organize a date that matches all of their preferences. It will make scheduling well-planned dates and activities simple and provide a way to quickly organize them in little to no time at all. Eventually this app will also provide a space for communities of people to share and vote on their favorite activities.

I started developing this app because my wife would ask me each week what we should do for date night and I was stressed out trying to juggle plans and present new ideas all the time. I created this app in order to solve my problem. My vision is: She asks what date we should go on and within a minute I'll have a fully scheduled date that meets all of our criteria. (budget, timeframe, stay in/go out, etc..)

[Software Demo Video](https://youtu.be/vXwXmTI3lis)

# Development Environment

I used VS Code and Expo Go.

I developed this app using React Native. React Native is a cross-platform language that closely resembles the React web language.

##### Notable Libraries:
* nativewind (tailwind css for react native apps)
* expo-Location
* react-native-community/datetimepicker


# Useful Websites

* [Tailwind Docs](https://tailwindcss.com/)
* [Expo Docs](https://docs.expo.dev/)
* [Figma](https://www.figma.com/)

# Future Work

* UI: I'm not using space effectively and it's not very visually appealing.
* Generation Algorithm: I've developed most of the UI, now I need to sort out the logic behind it.
* Database: I need to build a large, clean dataset to make the app work well.

## ===============================================

# SQL Relational Database Overview

I created a docker container that contains a PostgreSQL relational database that lets me use CRUD operations on my date ideas and sort through them efficiently.

I know this app will require a huge amount of clean data in order to operate as intented. I decided to us a PostgreSQL database running on docker in order to build out the initial schema for my database before deploying it to the cloud for production.

# Relational Database

I am using PostgreSQL running inside a Docker container. I chose PostgreSQL because of its strict data typing and support for advanced features like array filtering and potential future extensions for geospatial data (PostGIS) and vector search (pgvector).

I've created about five different tables so far, but the most important ones for this app are: Date_Idea, Tags, and Date_Tags. Date_Idea holds a myriad of data about all the different date ideas, and Tags holds my tags. Date_Tags is the binding table between them for a many-to-many relationship.

# Development Environment

I used docker because of how easy it was to set up a Postgres database and maintain and operate it. I used React Native and Expo on the frontend to consume the data coming back from the database.

The main languages I used are: ReactNative, SQL, and ExpressJS. ReactNative is used for the front end to display all the data and ExpressJS and SQL are used on the backend to query and provide data to the frontend from my docker container.

# Useful Websites

- [ExpressJS Docs](https://expressjs.com/)
- [React Native Docs](https://reactnative.dev/)
- [PostgreSQL Docs](https://www.postgresql.org/)
- [Docker Docs](https://docs.docker.com/)

# Future Work

- Update the schema for Date_Ideas to include open times and other valuable, pertinent data.
- Update the searching and sorting for date ideas to use AI vectoring instead of having to tag each date idea manually.
- Refine the user schema so that I can add auth logic and social-media-like interaction between users.

## ===============================================

# GIS Mapping Overview

{Provide a description the map software that you wrote. Describe how to use your software.  Describe the source of the data that you used.}
I added mapping functionality to my existing Venture app. It is available in the explore tab if you tap on "Map" at the top right. This map will visualize all of the activities in the database according to any filters you apply.

{Describe your purpose for writing this software.}
I know the importance of visualization when you're trying to plan an activity and want to know where everything is and how it fits into your plans. This feature was absolutely necessary for user experience.


# Development Environment

{Describe the tools that you used to develop the software}
My main tool was VS Code. I also used Docker to run my database and seed data that I could pull into my map.

{Describe the programming language that you used and any libraries.}
My primary language used was React Native. I also used TypeScript where necessary to implement logic and edit the backend. The most important library from this feature was the react-native-maps library. It made implementing a map much easier.

# Useful Websites

{Make a list of websites that you found helpful in this project}
* [React Native Maps Docs](https://docs.expo.dev/versions/latest/sdk/map-view/)

# Future Work

{Make a list of things that you need to fix, improve, and add in the future.}
* Change the style of the pins depending on the type of activity.
* Make activities searchable using the search bar and make the map update accordingly.
* Rework map style so it fits better in the UI. 