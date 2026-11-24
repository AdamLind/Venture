# Launch ideas

The ideas Venture launches with (#71), one JSON file per city (`provo.json`,
`salt-lake-city.json`). They're posted by the official **@system** account (a
placeholder until the app's name is settled: `OFFICIAL_USERNAME` in the
import), and each new one waits in the moderation queue (Settings ›
Moderation) until someone approves it in the app.

```sh
cd mobile-client
node scripts/import-ideas.mjs              # check every file; saves nothing
node scripts/import-ideas.mjs --import     # save the ideas that pass
node scripts/import-ideas.mjs --photos     # also check photo links load
```

Problems marked **✗** stop that idea from importing; **!** is worth a look
but imports. Running it again is safe: a changed idea is updated (keeping its
review status), an unchanged one is left alone. `--import --retire` hides
official ideas that were taken out of the files. `--import --publish` skips
the review queue for new ideas (only for ideas you've already checked).

**Fixing an idea in the app:** admins can edit the official account's
ideas from the idea page (the pencil), with the same form as posting; they
keep their review status. The next import leaves an idea changed in the app
alone and lists it: copy the change into its file, or `--import --force` to
put the file's version back.

Files starting with `_` are examples and never imported: see
[`_example.json`](_example.json).

## A file

```json
{
  "city": "provo",
  "center": "40.2338, -111.6585",
  "places": [ { "id": "rock-canyon", "name": "Rock Canyon Park", "...": "..." } ],
  "ideas": [ { "key": "provo/rock-canyon-sunset-walk", "...": "..." } ]
}
```

- `city`: lowercase; every key in the file starts with it
- `center`: the city's middle. A pin over 80 mi away gets a warning
  (usually a swapped lat and lng)
- `places`: places used by more than one idea, written once. An idea can
  also write its place inline

## An idea

| Field | What it is |
|---|---|
| `key` | Stable id, `city/words-with-dashes`. Never change it once imported: it's how a re-run finds the idea |
| `status` | `"ready"` (default) or `"draft"` (checked, never imported) |
| `title` | Up to 60 characters |
| `description` | What you do and why it's a good date, 40 to 600 characters |
| `type` | `MEAL`, `TREAT` or `OTHER` (an activity; `ACTIVE` still works and is saved as `OTHER`, since effort is its own field) |
| `where` | `"out"` or `"in"` (stay in: no place, it happens at home) |
| `environment` | `INDOOR`, `OUTDOOR` or `MIXED` (stay in: `INDOOR` unless you say) |
| `place` | Going out: a place's `id` from `places`, or the place itself (below) |
| `price` | Dollars per person; `0` if it's free. Required |
| `minutes` | How long it usually takes, 10 to 720 |
| `flexible_length` | `true` if it's fine shorter or longer (a walk, a café) |
| `best_time` | List of `EARLY_MORNING`, `MORNING`, `AFTERNOON`, `EVENING`, `LATE_NIGHT` |
| `months` | `"any"`, or the months it works, like `[5, 6, 7, 8, 9]` |
| `holidays` | Only around these: `VALENTINES`, `INDEPENDENCE_DAY`, `HALLOWEEN`, `CHRISTMAS`, `NEW_YEARS_EVE` |
| `weather` | Outdoors: `ANY`, `NICE`, `WARM` or `COLD` |
| `feel` | `CALM` or `UPBEAT` |
| `exertion` | `NONE`, `LIGHT` or `HARD` (hard is labelled strenuous) |
| `people` | `[fewest, most]`, like `[2, 6]`; default anyone |
| `tags` | From: brunch, cafes, casual, desserts, global, upscale · adventure, games, nature, sports, views, walks, water · comedy, festivals, movies, museums, music, theater · board games, cooking, crafts, romantic, spa |
| `risks` | What to know: `HEIGHTS`, `WATER`, `REMOTE`, `PERMIT`, `GUIDE` |
| `safety_note` | A short heads-up, up to 300 characters |
| `url` | The place's site, a menu, or tickets |
| `photos` | Links, or files next to this one (`"photos/rock-canyon.jpg"`, ~1200 px wide). Use photos you took or ones whose licence allows it |
| `notes` | For us; never imported |

## A place

| Field | What it is |
|---|---|
| `id` | In `places`: what ideas call it by |
| `name` | Its real name, as on the sign |
| `address` | Street address (a trailhead: the road and town) |
| `pin` | `"lat, lng"`, pasted from a map: where you go in, or park |
| `hours` | OpenStreetMap format (`"Mo-Fr 11:00-21:00; Sa 10:00-22:00; Su off"`), `"daylight"`, `"24/7"`, or `"unknown"` |
| `access_note` | How to get there if it isn't obvious, up to 300 characters |

A place already on Venture (a public one within 75 m with the same name) is
reused, not added again. New places are public. The daily OpenStreetMap job
may fill in or update their hours.
