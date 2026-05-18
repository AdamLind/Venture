import express, {Request, Response, Application} from "express";
import {Pool, QueryResult} from "pg";

const app: Application = express();
const port = 3000;

// Define the structures for type safety
interface DateIdea {
  idea_id: number;
  title: string;
  description: string | null;
  modality: "STAY_IN" | "GO_OUT";
  // Price is returned as a string from the PostgreSQL DECIMAL type
  est_price_per_person: string;
  creator_username: string | null;
  latitude?: number;
  longitude?: number;
}

interface User {
  user_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string; // TIMESTAMP is often returned as a string
}

// PostgreSQL Connection Pool: Connects to the Docker container
// NOTE: Ensure these credentials match your Docker setup.
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "postgres",
  password: "mysecretpassword",
  port: 5432,
});

app.use(express.json());

// --- ENDPOINT 1: Get all public date ideas ---
app.get(
  "/api/ideas",
  async (req: Request, res: Response<DateIdea[] | {error: string}>) => {
    try {
      // NOTE: The previous SQL had a WHERE di.is_public = FALSE which is usually incorrect for a public list.
      // I've removed that WHERE clause to fetch all ideas, as intended for an "Explore" screen.
      const queryText = `
        SELECT
            di.idea_id,
            di.title,
            di.description,
            di.modality,
            di.est_price_per_person::text as est_price_per_person, 
            di.latitude,
            di.longitude,
            u.username as creator_username
        FROM Date_Ideas di
        LEFT JOIN Users u ON di.user_id = u.user_id
        ORDER BY RANDOM()
    `;

      const result: QueryResult<DateIdea> = await pool.query(queryText);

      res.json(result.rows);
    } catch (err) {
      console.error("Database query error in /api/ideas:", err);
      res.status(500).json({error: "Failed to retrieve ideas."});
    }
  },
);

// --- NEW ENDPOINT 2: Create a new date idea (POST) ---
// --- UPDATED ENDPOINT: Create Idea + Save Tags ---
app.post(
  "/api/ideas",
  async (req: Request, res: Response<DateIdea | {error: string}>) => {
    const {
      title,
      description,
      modality,
      est_price_per_person,
      creator_username,
      latitude,
      longitude,
      tags, // Array of tag IDs (e.g., [1, 3])
    } = req.body;

    if (!title || !modality || est_price_per_person === undefined) {
      return res.status(400).json({
        error: "Missing required fields.",
      });
    }

    try {
      // 1. Get User ID (Existing Logic)
      let userId: number | null = null;
      if (creator_username) {
        const userQuery = await pool.query(
          "SELECT user_id FROM Users WHERE username = $1",
          [creator_username],
        );
        userId = userQuery.rows.length > 0 ? userQuery.rows[0].user_id : null;
      }

      // 2. Insert the Idea
      const queryText = `
          INSERT INTO Date_Ideas (title, description, modality, est_price_per_person, user_id, is_public, latitude, longitude)
          VALUES ($1, $2, $3, $4::DECIMAL, $5, TRUE, $6, $7) 
          RETURNING idea_id, title, description, modality, est_price_per_person::text
      `;

      const values = [
        title,
        description || null,
        modality,
        est_price_per_person,
        userId,
        latitude || null,
        longitude || null,
      ];
      const result: QueryResult<DateIdea> = await pool.query(queryText, values);
      const newIdea = result.rows[0];

      // 3. NEW: Insert Tags (if provided)
      if (tags && Array.isArray(tags) && tags.length > 0) {
        const newIdeaId = newIdea.idea_id;

        // Loop through tags and insert into linking table
        // (Note: In a production app, you might use a transaction here)
        for (const tagId of tags) {
          await pool.query(
            "INSERT INTO idea_tags (idea_id, tag_id) VALUES ($1, $2)",
            [newIdeaId, tagId],
          );
        }
      }

      res.status(201).json(newIdea);
    } catch (err) {
      console.error("Database query error in POST /api/ideas:", err);
      res.status(500).json({error: "Failed to create new idea."});
    }
  },
);

// NEW HELPER: Get tags for a specific idea (for the Edit Screen)
app.get("/api/ideas/:id/tags", async (req: Request, res: Response) => {
  try {
    const ideaId = parseInt(req.params.id);
    // Return just the array of tag_ids
    const result = await pool.query(
      "SELECT tag_id FROM idea_tags WHERE idea_id = $1",
      [ideaId],
    );
    // Transform [{tag_id: 1}, {tag_id: 2}] -> [1, 2]
    const tagIds = result.rows.map((row: any) => row.tag_id);
    res.json(tagIds);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: "Failed to fetch idea tags"});
  }
});

// UPDATED PUT: Handle Tags
app.put(
  "/api/ideas/:id",
  async (
    req: Request<{id: string}>,
    res: Response<DateIdea | {error: string}>,
  ) => {
    const ideaId = parseInt(req.params.id);
    const {
      title,
      description,
      modality,
      est_price_per_person,
      latitude,
      longitude,
      tags, // <--- NEW: Array of IDs
    } = req.body;

    if (isNaN(ideaId)) return res.status(400).json({error: "Invalid ID"});

    try {
      // 1. Update the Date Idea
      const queryText = `
          UPDATE Date_Ideas
          SET title = $1, description = $2, modality = $3, est_price_per_person = $4::DECIMAL,
              latitude = $6, longitude = $7
          WHERE idea_id = $5
          RETURNING idea_id, title, description, modality, est_price_per_person::text -- <--- Add here
      `;

      const values = [
        title,
        description,
        modality,
        est_price_per_person,
        ideaId,
        latitude || null,
        longitude || null,
      ];
      const result = await pool.query(queryText, values);

      if (result.rowCount === 0)
        return res.status(404).json({error: "Idea not found."});

      // 2. Update Tags (The "Reset" Strategy)
      if (tags && Array.isArray(tags)) {
        // A. Remove ALL existing tags for this idea
        await pool.query("DELETE FROM idea_tags WHERE idea_id = $1", [ideaId]);

        // B. Insert the new set
        for (const tagId of tags) {
          await pool.query(
            "INSERT INTO idea_tags (idea_id, tag_id) VALUES ($1, $2)",
            [ideaId, tagId],
          );
        }
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error(`Database query error in PUT /api/ideas/${ideaId}:`, err);
      res.status(500).json({error: "Failed to update idea."});
    }
  },
);

// --- NEW ENDPOINT 4: Delete a date idea (DELETE) ---
app.delete(
  "/api/ideas/:id",
  async (
    req: Request<{id: string}>,
    res: Response<{message: string} | {error: string}>,
  ) => {
    const ideaId = parseInt(req.params.id);

    if (isNaN(ideaId)) {
      return res.status(400).json({error: "Invalid idea ID format."});
    }

    try {
      const queryText = "DELETE FROM Date_Ideas WHERE idea_id = $1";
      const result = await pool.query(queryText, [ideaId]);

      if (result.rowCount === 0) {
        return res.status(404).json({error: "Idea not found."});
      }

      res.status(200).json({message: "Idea successfully deleted."});
    } catch (err) {
      console.error(
        `Database query error in DELETE /api/ideas/${ideaId}:`,
        err,
      );
      res.status(500).json({error: "Failed to delete idea."});
    }
  },
);

// --- ENDPOINT 5: Get all users (non-sensitive data only) ---
// (Kept for completeness, remains unchanged)
app.get(
  "/api/users",
  async (req: Request, res: Response<User[] | {error: string}>) => {
    try {
      const queryText = `
            SELECT
                user_id,
                username,
                first_name,
                last_name,
                created_at
            FROM Users
            ORDER BY user_id ASC
        `;

      const result: QueryResult<User> = await pool.query(queryText);

      res.json(result.rows);
    } catch (err) {
      console.error("Database query error in /api/users:", err);
      res.status(500).json({error: "Failed to retrieve users."});
    }
  },
);

// --- UPDATED ENDPOINT: Safer Grouping Logic ---
app.get(
  "/api/ideas/filter",
  async (req: Request, res: Response<any[] | {error: string}>) => {
    try {
      const {tags} = req.query;

      if (!tags || typeof tags !== "string") {
        return res.status(400).json({error: "Invalid tags parameter."});
      }

      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== "");
      const tagCount = tagList.length;

      // Log the attempt to your terminal so you can see it happening
      console.log(`Filtering for ${tagCount} tags:`, tagList);

      const queryText = `
            SELECT 
                d.idea_id, 
                d.title, 
                d.description, 
                d.modality,
                d.est_price_per_person::text,
                u.username as creator_username,
                d.latitude,
                d.longitude
            FROM date_ideas d
            LEFT JOIN users u ON d.user_id = u.user_id
            JOIN idea_tags it ON d.idea_id = it.idea_id
            JOIN tags t ON it.tag_id = t.tag_id
            
            -- We cast the parameter to text[] to be absolutely safe
            WHERE t.name = ANY($1::text[])
            
            -- SIMPLIFIED GROUP BY: 
            -- Grouping by the Primary Key (d.idea_id) covers all columns in 'd'.
            -- We only need to add columns from other tables (u.username).
            GROUP BY d.idea_id, u.username
            
            HAVING COUNT(DISTINCT t.tag_id) = $2
            
            ORDER BY d.title ASC;
        `;

      const result = await pool.query(queryText, [tagList, tagCount]);

      console.log(`Found ${result.rows.length} matches.`); // Debug log
      res.json(result.rows);
    } catch (err: any) {
      // Log the ACTUAL SQL error to your terminal
      console.error("SQL Error in /filter:", err.message);
      res.status(500).json({error: "Database error during filter."});
    }
  },
);

// --- NEW ENDPOINT: Get List of All Tags ---
app.get("/api/tags", async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT * FROM tags ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({error: "Failed to load tags"});
  }
});

app.post("/api/ideas/anchors", async (req, res) => {
  const {userId, vibes, budget, modality, currentLocation, travelDistance} =
    req.body;

  // Calculate bounds ONLY if going out AND location is provided
  let bounds = null;
  if (modality === "GO_OUT" && currentLocation && travelDistance) {
    const {latitude, longitude} = currentLocation;
    const MILES_PER_LAT = 69;
    const latDelta = travelDistance / MILES_PER_LAT;
    const latInRadians = (latitude * Math.PI) / 180;
    const lonDelta = travelDistance / (MILES_PER_LAT * Math.cos(latInRadians));

    bounds = {
      minLat: latitude - latDelta,
      maxLat: latitude + latDelta,
      minLon: longitude - lonDelta,
      maxLon: longitude + lonDelta,
    };
  }

  try {
    // The Query: No JOINs, Native Arrays, and UGC Protection
    const queryText = `
      SELECT * FROM activities
      WHERE modality = $1
        AND est_price_per_person <= $2
        
        -- UGC GATEKEEPER: See all public ideas, plus their own private/pending ones
        AND (
          visibility = 'PUBLISHED' 
          OR ($3::uuid IS NOT NULL AND user_id = $3::uuid AND visibility IN ('PRIVATE', 'PENDING'))
        )
        
        -- TAGS FILTER: The && operator checks if the arrays overlap (has at least one matching tag)
        AND ($4::text[] IS NULL OR tags && $4::text[])
        
        -- LOCATION FILTER: Ignored if STAY_IN, otherwise checks the bounding box
        AND (
          $5::boolean IS FALSE 
          OR modality = 'STAY_IN' 
          OR (latitude >= $6 AND latitude <= $7 AND longitude >= $8 AND longitude <= $9)
        )
      ORDER BY RANDOM() -- Shuffle results so the user doesn't see the exact same anchors every time
      LIMIT 20;
    `;

    const hasLocation = bounds !== null;

    // Ensure vibes is either a valid array (e.g., ['casual', 'soda']) or strictly null for the query
    const formattedVibes =
      vibes && Array.isArray(vibes) && vibes.length > 0 ? vibes : null;

    const result = await pool.query(queryText, [
      modality, // $1 ('STAY_IN' or 'GO_OUT')
      budget, // $2 (Numeric)
      userId || null, // $3 (Pass null if they are a guest)
      formattedVibes, // $4 (Array of strings)
      hasLocation, // $5 (Boolean)
      bounds?.minLat || 0, // $6
      bounds?.maxLat || 0, // $7
      bounds?.minLon || 0, // $8
      bounds?.maxLon || 0, // $9
    ]);

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching anchors:", err);
    res.status(500).json({error: "Internal server error"});
  }
});

// --- NEW ENDPOINT: GET FILLERS BASED ON USER PREFS & CURRENT LOCATION ---
app.post("/api/ideas/fill-schedule", async (req, res) => {
  const {
    userId,
    vibes,
    budget,
    modality,
    maxDuration,
    currentLocation,
    travelDistance,
  } = req.body;

  // 1. Calculate bounds ONLY if going out AND location is provided
  let bounds = null;
  if (modality === "GO_OUT" && currentLocation && travelDistance) {
    const {latitude, longitude} = currentLocation;
    const MILES_PER_LAT = 69;
    const latDelta = travelDistance / MILES_PER_LAT;
    const latInRadians = (latitude * Math.PI) / 180;
    const lonDelta = travelDistance / (MILES_PER_LAT * Math.cos(latInRadians));

    bounds = {
      minLat: latitude - latDelta,
      maxLat: latitude + latDelta,
      minLon: longitude - lonDelta,
      maxLon: longitude + lonDelta,
    };
  }

  try {
    // 2. The Clean Query: No JOINs, Native Arrays, UGC Protection, and Time Limits
    const queryText = `
      SELECT * FROM activities
      WHERE modality = $1 
        AND est_price_per_person <= $2
        AND est_duration_minutes <= $3
        
        -- UGC GATEKEEPER: See all public ideas, plus their own private/pending ones
        AND (
          visibility = 'PUBLISHED' 
          OR ($4::uuid IS NOT NULL AND user_id = $4::uuid AND visibility IN ('PRIVATE', 'PENDING'))
        )
        
        -- TAGS FILTER: Check if the arrays overlap
        AND ($5::text[] IS NULL OR tags && $5::text[])
        
        -- CONDITIONAL LOCATION FILTER
        AND (
          $6::boolean IS FALSE 
          OR modality = 'STAY_IN'
          OR (latitude >= $7 AND latitude <= $8 AND longitude >= $9 AND longitude <= $10)
        )
      ORDER BY RANDOM()
      LIMIT 4; -- Fillers only need a few options
    `;

    const hasLocation = bounds !== null;
    const formattedVibes =
      vibes && Array.isArray(vibes) && vibes.length > 0 ? vibes : null;

    const result = await pool.query(queryText, [
      modality, // $1 ('STAY_IN' or 'GO_OUT')
      budget, // $2
      maxDuration || 60, // $3 (Fallback to 60 mins if undefined)
      userId || null, // $4
      formattedVibes, // $5
      hasLocation, // $6
      bounds?.minLat || 0, // $7
      bounds?.maxLat || 0, // $8
      bounds?.minLon || 0, // $9
      bounds?.maxLon || 0, // $10
    ]);

    res.json(result.rows);
  } catch (err) {
    console.error("SQL Error in Fill-Schedule:", err);
    res.status(500).json({error: "Failed to fetch fillers"});
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  // Reminder for React Native: use the correct IP address for your local network
  console.log(`Ideas endpoint: http://(ipAddress):${port}/api/ideas`);
});
