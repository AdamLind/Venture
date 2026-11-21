import "dotenv/config";
import {createClient} from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DEV_USER_ID = "e2fff1ae-a96c-4d8e-8be9-626e5ee260c9";

async function seed() {
  console.log("🌱 Starting database seed...");

  // ---------------------------------------------------------------------------
  // 0. RESET/CLEAR EXISTING DATA
  // Order: Junction tables -> Child tables -> Parent tables
  // ---------------------------------------------------------------------------
  console.log("🧹 Wiping existing data...");

  // Clear linking/junction tables first
  const {error: clearTagsError} = await supabase
    .from("activity_tags")
    .delete()
    .neq("idea_id", "00000");

  if (clearTagsError) {
    console.error("❌ Error wiping activity_tags:", clearTagsError.message);
    return;
  }

  // Clear activities
  const {error: clearActError} = await supabase
    .from("activities")
    .delete()
    .neq("idea_id", "00000");

  if (clearActError) {
    console.error("❌ Error wiping activities:", clearActError.message);
    return;
  }

  // Clear venues
  const {error: clearVenError} = await supabase
    .from("venues")
    .delete()
    .neq("venue_id", "00000000-0000-0000-0000-000000000000");

  if (clearVenError) {
    console.error("❌ Error wiping venues:", clearVenError.message);
    return;
  }

  console.log("✅ Database reset complete.");

  // ---------------------------------------------------------------------------
  // 1. INSERT VENUES
  // ---------------------------------------------------------------------------
  // opening_hours: made-up test hours in OpenStreetMap format (#4); outdoor
  // spots with no hours are left unknown. Real venues replace these (#71)
  const venueSeeds = [
    {
      name: "Provo Canyon Stargazing Spot",
      address: "Provo Canyon Rd, Provo, UT 84604",
      coordinates: "POINT(-111.6585 40.2338)",
    },
    {
      name: "Sundance Mountain Resort",
      address: "8841 Alpine Loop Scenic Byway, Sundance, UT 84604",
      coordinates: "POINT(-111.5888 40.3644)",
      opening_hours: "Mo-Su 09:00-21:00",
    },
    {
      name: "Downtown Gelato & Promenade",
      address: "43 N University Ave, Provo, UT 84601",
      coordinates: "POINT(-111.6588 40.2333)",
      opening_hours: "Mo-Th 12:00-22:00; Fr-Sa 12:00-23:00; Su off",
    },
    {
      name: "The Quarry Climbing Gym",
      address: "2494 N University Pkwy, Provo, UT 84604",
      coordinates: "POINT(-111.6515 40.2642)",
      opening_hours: "Mo-Fr 10:00-22:00; Sa 09:00-20:00; Su off",
    },
    {
      name: "Pioneer Park Farmers Market",
      address: "500 W Center St, Provo, UT 84601",
      coordinates: "POINT(-111.6675 40.2335)",
      opening_hours: "Sa 09:00-14:00",
    },
    {
      name: "University Ave Taco Trucks",
      address: "700 S University Ave, Provo, UT 84601",
      coordinates: "POINT(-111.6588 40.2238)",
      opening_hours: "Mo-Sa 11:00-14:00,17:00-23:00; Su off",
    },
    {
      name: "Jolley's Ranch Disc Golf Course",
      address: "Hobble Creek Canyon, Springville, UT 84663",
      coordinates: "POINT(-111.5120 40.1550)",
    },
    {
      name: "Classic Fun Center Mini Golf",
      address: "250 S State St, Orem, UT 84058",
      coordinates: "POINT(-111.6960 40.2930)",
      opening_hours: "Mo-Th 11:00-21:00; Fr-Sa 11:00-23:00; Su off",
    },
    {
      name: "Rock Canyon Park",
      address: "2620 N 1200 E, Provo, UT 84604",
      coordinates: "POINT(-111.6360 40.2680)",
      opening_hours: "Mo-Su 06:00-22:00",
    },
    {
      name: "Artisan Bakery & Cafe",
      address: "29 E Center St, Provo, UT 84601",
      coordinates: "POINT(-111.6580 40.2334)",
      opening_hours: "Mo-Sa 07:00-15:00; Su off",
    },
  ];

  const {data: createdVenues, error: venueError} = await supabase
    .from("venues")
    .insert(venueSeeds)
    .select("venue_id, name");

  if (venueError) {
    console.error("❌ Error inserting venues:", venueError.message);
    return;
  }

  const venueMap = {};
  createdVenues.forEach((v) => {
    venueMap[v.name] = v.venue_id;
  });

  console.log(`✅ Successfully seeded ${createdVenues.length} venues.`);

  // ---------------------------------------------------------------------------
  // 2. INSERT ACTIVITIES
  // ---------------------------------------------------------------------------
  const activitiesWithTags = [
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Provo Canyon Stargazing Spot"],
      title: "Stargazing & Hot Cocoa in the Canyon",
      description:
        "Pack a warm blanket, grab two thermos flasks of hot chocolate, and drive up the canyon for late-night stargazing.",
      url: "https://utahvalley.com",
      image_urls: [
        "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86",
      ],
      modality: "GO_OUT",
      activity_type: "OTHER",
      environment: "OUTDOOR",
      time_of_day: ["EVENING", "NIGHT"],
      est_price_per_person: 10.0,
      est_duration_minutes: 90,
      is_duration_variable: true,
      min_people: 2,
      max_people: 2,
      min_age: 0,
      visibility: "PENDING_REVIEW",
      tags: ["views", "nature", "romantic"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Homemade Pizza & Movie Marathon",
      description:
        "Make pizza dough from scratch together, pick your favorite toppings, and roll right into a movie trilogy.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1513104890138-7c749659a591",
      ],
      modality: "STAY_IN",
      activity_type: "MEAL",
      environment: "INDOOR",
      time_of_day: ["EVENING"],
      est_price_per_person: 15.0,
      est_duration_minutes: 180,
      is_duration_variable: false,
      min_people: 2,
      max_people: 4,
      min_age: 0,
      visibility: "PENDING_REVIEW",
      tags: ["casual", "movies", "romantic"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Sundance Mountain Resort"],
      title: "Scenic Canyon Chairlift Ride",
      description:
        "Take a chairlift ride up the mountain to see panoramic fall foliage views and grab lunch at the top lodge.",
      url: "https://sundanceresort.com",
      image_urls: [
        "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
      ],
      modality: "GO_OUT",
      activity_type: "ACTIVE",
      environment: "OUTDOOR",
      time_of_day: ["AFTERNOON"],
      est_price_per_person: 25.0,
      est_duration_minutes: 120,
      is_duration_variable: false,
      min_people: 1,
      max_people: 6,
      min_age: 5,
      visibility: "PUBLISHED",
      tags: ["views", "nature"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Board Game Tournament & Loaded Nachos",
      description:
        "Break out Strategy and Cooperative board games, bake a sheet pan of loaded nachos, and track points on a scoreboard.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09",
      ],
      modality: "STAY_IN",
      activity_type: "MEAL",
      environment: "INDOOR",
      time_of_day: ["EVENING"],
      est_price_per_person: 8.0,
      est_duration_minutes: 150,
      is_duration_variable: true,
      min_people: 3,
      max_people: 8,
      min_age: 10,
      visibility: "PRIVATE",
      tags: ["board games", "casual"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Downtown Gelato & Promenade"],
      title: "Late Night Ice Cream & City Walk",
      description:
        "Grab two scoops of artisan gelato and take a night stroll through the downtown streetlights.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1519501025264-65ba15a82390",
      ],
      modality: "GO_OUT",
      activity_type: "TREAT",
      environment: "INDOOR",
      time_of_day: ["NIGHT"],
      est_price_per_person: 7.5,
      est_duration_minutes: 45,
      is_duration_variable: false,
      min_people: 2,
      max_people: 4,
      min_age: 0,
      visibility: "REJECTED",
      tags: ["desserts", "walks", "casual"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "At-Home Watercolor Painting Night",
      description:
        "Set up watercolor paper, palettes, and brushes, and follow a relaxed landscape tutorial together.",
      url: "https://youtube.com",
      image_urls: [
        "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119",
      ],
      modality: "STAY_IN",
      activity_type: "OTHER",
      environment: "INDOOR",
      time_of_day: ["AFTERNOON"],
      est_price_per_person: 12.0,
      est_duration_minutes: 90,
      is_duration_variable: true,
      min_people: 1,
      max_people: 4,
      min_age: 6,
      visibility: "NEEDS_REVISION",
      tags: ["crafts"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["The Quarry Climbing Gym"],
      title: "Indoor Rock Climbing Session",
      description:
        "Pass a belay test or boulder through different routes for a fun workout and strength challenge.",
      url: "https://thequarrygym.com",
      image_urls: [
        "https://images.unsplash.com/photo-1522163182402-834f871fd851",
      ],
      modality: "GO_OUT",
      activity_type: "ACTIVE",
      environment: "INDOOR",
      time_of_day: ["AFTERNOON", "EVENING"],
      est_price_per_person: 20.0,
      est_duration_minutes: 120,
      is_duration_variable: true,
      min_people: 1,
      max_people: 4,
      min_age: 12,
      visibility: "PUBLISHED",
      tags: ["sports", "games"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Gourmet Chocolate Chip Cookie Bake-Off",
      description:
        "Test two different chocolate chip cookie recipes side by side to see which method wins the crown.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1499636136210-6f4ee915583e",
      ],
      modality: "STAY_IN",
      activity_type: "TREAT",
      environment: "INDOOR",
      time_of_day: ["AFTERNOON"],
      est_price_per_person: 6.0,
      est_duration_minutes: 75,
      is_duration_variable: false,
      min_people: 2,
      max_people: 5,
      min_age: 0,
      visibility: "PUBLISHED",
      tags: ["desserts", "casual", "cooking"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Pioneer Park Farmers Market"],
      title: "Saturday Farmers Market Crawl",
      description:
        "Pick up fresh produce, artisanal pastries, and handcrafted drinks while browsing local vendor stalls.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1488459716781-31db52582fe9",
      ],
      modality: "GO_OUT",
      activity_type: "TREAT",
      environment: "OUTDOOR",
      time_of_day: ["MORNING"],
      est_price_per_person: 15.0,
      est_duration_minutes: 90,
      is_duration_variable: true,
      min_people: 1,
      max_people: 6,
      min_age: 0,
      visibility: "PUBLISHED",
      tags: ["walks", "casual"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Backyard Mini Obstacle Course",
      description:
        "Set up cones, agility ladders, and timer stations in the yard for a fast-paced fitness competition.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1461896836934-ffe607ba8211",
      ],
      modality: "STAY_IN",
      activity_type: "ACTIVE",
      environment: "OUTDOOR",
      time_of_day: ["AFTERNOON"],
      est_price_per_person: 0.0,
      est_duration_minutes: 60,
      is_duration_variable: true,
      min_people: 2,
      max_people: 6,
      min_age: 6,
      visibility: "PENDING_REVIEW",
      tags: ["sports", "games", "nature"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["University Ave Taco Trucks"],
      title: "Taco Tuesday Street Food Crawl",
      description:
        "Visit three local taco trucks and score each taco on tortilla fresh, salsa spice, and filling flavor.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1565299585323-38d6b0865b47",
      ],
      modality: "GO_OUT",
      activity_type: "MEAL",
      environment: "MIXED",
      time_of_day: ["EVENING"],
      est_price_per_person: 18.0,
      est_duration_minutes: 105,
      is_duration_variable: true,
      min_people: 2,
      max_people: 6,
      min_age: 0,
      visibility: "PUBLISHED",
      tags: ["casual", "walks"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "DIY At-Home Spa & Face Mask Lounge",
      description:
        "Dim the lights, turn on soft acoustic music, apply clay masks, and relax with cucumber-infused water.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1540555700478-4be289fbecef",
      ],
      modality: "STAY_IN",
      activity_type: "OTHER",
      environment: "INDOOR",
      time_of_day: ["EVENING"],
      est_price_per_person: 5.0,
      est_duration_minutes: 60,
      is_duration_variable: false,
      min_people: 1,
      max_people: 3,
      min_age: 8,
      visibility: "PRIVATE",
      tags: ["spa", "romantic"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Jolley's Ranch Disc Golf Course"],
      title: "9-Hole Disc Golf Game",
      description:
        "Grab a driver and putter disc and play a quick 9-hole round through the local community park course.",
      url: "https://pdga.com",
      image_urls: [
        "https://images.unsplash.com/photo-1531415074968-036ba1b575da",
      ],
      modality: "GO_OUT",
      activity_type: "ACTIVE",
      environment: "OUTDOOR",
      time_of_day: ["MORNING", "AFTERNOON"],
      est_price_per_person: 0.0,
      est_duration_minutes: 90,
      is_duration_variable: true,
      min_people: 1,
      max_people: 4,
      min_age: 8,
      visibility: "PUBLISHED",
      tags: ["games", "nature", "walks"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Iced Matcha & Book Reading Corner",
      description:
        "Whisk up fresh iced matcha lattes with oat milk and spend a quiet afternoon reading side-by-side.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1536256263959-770b48d82b0a",
      ],
      modality: "STAY_IN",
      activity_type: "TREAT",
      environment: "INDOOR",
      time_of_day: ["MORNING", "AFTERNOON"],
      est_price_per_person: 4.0,
      est_duration_minutes: 120,
      is_duration_variable: true,
      min_people: 1,
      max_people: 2,
      min_age: 0,
      visibility: "PUBLISHED",
      tags: ["cafes", "romantic"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Classic Fun Center Mini Golf"],
      title: "Miniature Golf Championship",
      description:
        "Putt through 18 themed holes with windmills, water hazards, and friendly side-bets for loser buys ice cream.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa",
      ],
      modality: "GO_OUT",
      activity_type: "ACTIVE",
      environment: "MIXED",
      time_of_day: ["AFTERNOON", "EVENING"],
      est_price_per_person: 12.0,
      est_duration_minutes: 75,
      is_duration_variable: false,
      min_people: 2,
      max_people: 6,
      min_age: 4,
      visibility: "PENDING_REVIEW",
      tags: ["games", "walks", "casual"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Spanish Tapas & Sangria Night",
      description:
        "Cook patatas bravas, garlic shrimp, and Spanish tortilla while sipping cold mocktails or wine.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1541544741938-0af808871cc0",
      ],
      modality: "STAY_IN",
      activity_type: "MEAL",
      environment: "INDOOR",
      time_of_day: ["EVENING"],
      est_price_per_person: 22.0,
      est_duration_minutes: 150,
      is_duration_variable: false,
      min_people: 2,
      max_people: 6,
      min_age: 21,
      visibility: "REJECTED",
      tags: ["upscale", "romantic", "cooking"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Rock Canyon Park"],
      title: "Sunset Hillside Picnic",
      description:
        "Pack charcuterie, fresh berries, and sparkling cider to enjoy on a blanket while watching the sun go down.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1526772662000-3f88f10405ff",
      ],
      modality: "GO_OUT",
      activity_type: "MEAL",
      environment: "OUTDOOR",
      time_of_day: ["EVENING"],
      est_price_per_person: 14.0,
      est_duration_minutes: 90,
      is_duration_variable: true,
      min_people: 2,
      max_people: 6,
      min_age: 0,
      visibility: "PUBLISHED",
      tags: ["views", "nature", "romantic", "casual"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "1000-Piece Jigsaw Puzzle & True Crime Podcast",
      description:
        "Clear off the dining room table, sort puzzle edge pieces, and stream an immersive investigative audio series.",
      url: null,
      image_urls: [
        "https://images.unsplash.com/photo-1585829365295-ab7cd400c167",
      ],
      modality: "STAY_IN",
      activity_type: "OTHER",
      environment: "INDOOR",
      time_of_day: ["AFTERNOON", "EVENING"],
      est_price_per_person: 0.0,
      est_duration_minutes: 180,
      is_duration_variable: true,
      min_people: 1,
      max_people: 4,
      min_age: 12,
      visibility: "NEEDS_REVISION",
      tags: ["board games"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: venueMap["Artisan Bakery & Cafe"],
      title: "Artisan Bakery Morning Tasting",
      description:
        "Order warm almond croissants and espresso shots at a local French bakery right when doors open.",
      url: null,
      image_urls: ["https://images.unsplash.com/photo-1555507036-ab1f4038808a"],
      modality: "GO_OUT",
      activity_type: "TREAT",
      environment: "INDOOR",
      time_of_day: ["MORNING"],
      est_price_per_person: 11.0,
      est_duration_minutes: 45,
      is_duration_variable: false,
      min_people: 1,
      max_people: 4,
      min_age: 0,
      visibility: "PUBLISHED",
      tags: ["cafes", "desserts", "casual"],
    },
    {
      user_id: DEV_USER_ID,
      venue_id: null,
      title: "Virtual Mystery Escape Room",
      description:
        "Gather around a shared screen to solve digital puzzles, decode secret messages, and break out before 60 minutes.",
      url: "https://theescapegame.com",
      image_urls: [
        "https://images.unsplash.com/photo-1511512578047-dfb367046420",
      ],
      modality: "STAY_IN",
      activity_type: "OTHER",
      environment: "INDOOR",
      time_of_day: ["NIGHT"],
      est_price_per_person: 10.0,
      est_duration_minutes: 60,
      is_duration_variable: false,
      min_people: 2,
      max_people: 6,
      min_age: 10,
      visibility: "PRIVATE",
      tags: ["games", "romantic"],
    },
  ];

  // Strip tags out of the activities before inserting (since tags go in the junction table)
  const activitiesToInsert = activitiesWithTags.map(({tags, ...rest}) => rest);

  const {data: insertedActivities, error: activityError} = await supabase
    .from("activities")
    .insert(activitiesToInsert)
    .select("idea_id, title, visibility, modality");

  if (activityError) {
    console.error("❌ Error inserting activities:", activityError.message);
    return;
  }

  console.log(
    `✅ Successfully seeded ${insertedActivities.length} activities.`,
  );

  // ---------------------------------------------------------------------------
  // 3. INSERT TAGS (Junction Table)
  // ---------------------------------------------------------------------------
  // Tag ids by name (supabase/migrations/20261120040000_tag_rework.sql)
  const {data: tagRows, error: tagLookupError} = await supabase.from("tags").select("tag_id, name");
  if (tagLookupError) {
    console.error("❌ Error reading tags:", tagLookupError.message);
    return;
  }
  const tagMapping = Object.fromEntries(tagRows.map((t) => [t.name, t.tag_id]));

  const tagsPayload = [];

  insertedActivities.forEach((act) => {
    const originalActivity = activitiesWithTags.find(
      (a) => a.title === act.title,
    );

    if (originalActivity && originalActivity.tags) {
      originalActivity.tags.forEach((tagName) => {
        const numericTagId = tagMapping[tagName];
        if (numericTagId) {
          tagsPayload.push({
            idea_id: act.idea_id,
            tag_id: numericTagId, // Pass the number, not the string!
          });
        } else {
          console.warn(`⚠️ Warning: Unknown tag name "${tagName}" found.`);
        }
      });
    }
  });

  if (tagsPayload.length > 0) {
    const {error: tagsError} = await supabase
      .from("activity_tags")
      .insert(tagsPayload);

    if (tagsError) {
      console.error("❌ Error inserting activity tags:", tagsError.message);
      return;
    }
    console.log(`✅ Successfully seeded ${tagsPayload.length} activity tags.`);
  }

  console.log("🎉 Seed completed successfully! Inserted activities:");
  insertedActivities.forEach((act) => {
    console.log(
      `   - [ID: ${act.idea_id}] [${act.modality}] [${act.visibility}] ${act.title}`,
    );
  });
}

seed();
