# Mobile App Overview

This app, Venture, is an app that is designed to pull in numerous date/activtiy ideas from the web and organize them into a database. Then, when a user enters their criteria for their perfect date the app will algorithmically select activities and organize a date that matches all of their preferences. It will make scheduling well-planned dates and activities simple and provide a way to quickly organize them in little to no time at all. Eventually this app will also provide a space for communities of people to share and vote on their favorite activities.

I started developing this app because my wife would ask me each week what we should do for date night and I was stressed out trying to juggle plans and present new ideas all the time. I created this app in order to solve my problem. My vision is: She asks what date we should go on and within a minute I'll have a fully scheduled date that meets all of our criteria. (budget, timeframe, stay in/go out, etc..)

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

# Backend

Venture's backend is [Supabase](https://supabase.com/docs): a hosted PostgreSQL database (with PostGIS for places), sign-in, storage for photos, and row-level security so people only see what they should. The schema is in `supabase/migrations`.

It started as a PostgreSQL database in a local Docker container behind a small Express API (`server/`). Supabase replaced both, and the old server was removed; it's still in the git history.

## ===============================================

# GIS Mapping Overview

I added mapping functionality to my existing Venture app. It is available in the explore tab if you tap on "Map" at the top right. This map will visualize all of the activities in the database according to any filters you apply.

I know the importance of visualization when you're trying to plan an activity and want to know where everything is and how it fits into your plans. This feature was absolutely necessary for user experience.


# Development Environment

My main tool was VS Code. I also used Docker to run my database and seed data that I could pull into my map.

My primary language used was React Native. I also used TypeScript where necessary to implement logic and edit the backend. The most important library from this feature was the react-native-maps library. It made implementing a map much easier.

# Useful Websites

* [React Native Maps Docs](https://docs.expo.dev/versions/latest/sdk/map-view/)

# Future Work

* Change the style of the pins depending on the type of activity.
* Make activities searchable using the search bar and make the map update accordingly.
* Rework map style so it fits better in the UI. 
