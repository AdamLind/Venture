// scripts/set-test-hours.js
// Gives the seeded test venues made-up opening hours (#4), without
// re-seeding (seed.js wipes everything). Only sets opening_hours on venues
// matched by name; nothing is deleted. Same hours as seed.js.
//
//   node scripts/set-test-hours.js
//
// Needs EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env (the
// secret key never ships in the app).

import "dotenv/config";
import {createClient} from "@supabase/supabase-js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TEST_HOURS = {
  "Sundance Mountain Resort": "Mo-Su 09:00-21:00",
  "Downtown Gelato & Promenade": "Mo-Th 12:00-22:00; Fr-Sa 12:00-23:00; Su off",
  "The Quarry Climbing Gym": "Mo-Fr 10:00-22:00; Sa 09:00-20:00; Su off",
  "Pioneer Park Farmers Market": "Sa 09:00-14:00",
  "University Ave Taco Trucks": "Mo-Sa 11:00-14:00,17:00-23:00; Su off",
  "Classic Fun Center Mini Golf": "Mo-Th 11:00-21:00; Fr-Sa 11:00-23:00; Su off",
  "Rock Canyon Park": "Mo-Su 06:00-22:00",
  "Artisan Bakery & Cafe": "Mo-Sa 07:00-15:00; Su off",
};

for (const [name, opening_hours] of Object.entries(TEST_HOURS)) {
  const {data, error} = await supabase
    .from("venues")
    .update({opening_hours})
    .eq("name", name)
    .select("venue_id");
  if (error) console.error(`❌ ${name}: ${error.message}`);
  else console.log(`${data.length ? "✅" : "⚠️  not found:"} ${name}${data.length ? ` → ${opening_hours}` : ""}`);
}
