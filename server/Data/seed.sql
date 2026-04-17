-- 1. Insert 20 Date Ideas with Lat/Longs (San Francisco Area)
-- We use San Francisco coordinates so they appear close together on the map
INSERT INTO date_ideas (title, modality, est_price_per_person, latitude, longitude, is_public) VALUES
('Golden Gate Park Picnic', 'GO_OUT', 15.00, 37.7694, -122.4862, true),
('Pier 39 Sea Lions', 'GO_OUT', 0.00, 37.8087, -122.4098, true),
('Palace of Fine Arts Stroll', 'GO_OUT', 0.00, 37.8029, -122.4484, true),
('Ferry Building Market', 'GO_OUT', 25.00, 37.7955, -122.3937, true),
('Coit Tower Hike', 'GO_OUT', 10.00, 37.8024, -122.4058, true),
('Lombard Street Walk', 'GO_OUT', 0.00, 37.8021, -122.4187, true),
('Alcatraz Night Tour', 'GO_OUT', 50.00, 37.8270, -122.4230, true),
('Exploratorium Date', 'GO_OUT', 35.00, 37.8009, -122.3986, true),
('SF MOMA Art Day', 'GO_OUT', 25.00, 37.7857, -122.4011, true),
('Twin Peaks View', 'GO_OUT', 0.00, 37.7544, -122.4477, true),
('Japanese Tea Garden', 'GO_OUT', 12.00, 37.7700, -122.4700, true),
('Lands End Trail', 'GO_OUT', 0.00, 37.7878, -122.5058, true),
('Ghirardelli Square Ice Cream', 'GO_OUT', 15.00, 37.8059, -122.4230, true),
('Painted Ladies Photo Op', 'GO_OUT', 0.00, 37.7762, -122.4328, true),
('Castro Theatre Movie', 'GO_OUT', 20.00, 37.7620, -122.4350, true),
('Mission Dolores Park', 'GO_OUT', 0.00, 37.7596, -122.4269, true),
('Salesforce Park Walk', 'GO_OUT', 0.00, 37.7897, -122.3972, true),
('Baker Beach Sunset', 'GO_OUT', 0.00, 37.7936, -122.4836, true),
('California Academy of Sciences', 'GO_OUT', 40.00, 37.7699, -122.4661, true),
('Cable Car Ride', 'GO_OUT', 8.00, 37.7877, -122.4075, true);

INSERT INTO idea_tags (idea_id, tag_id) 
SELECT idea_id, 1 FROM date_ideas WHERE title LIKE '%Sunset%' OR title LIKE '%View%' ON CONFLICT DO NOTHING;

INSERT INTO idea_tags (idea_id, tag_id) 
SELECT idea_id, 2 FROM date_ideas WHERE est_price_per_person = 0 ON CONFLICT DO NOTHING;

INSERT INTO idea_tags (idea_id, tag_id) 
SELECT idea_id, 3 FROM date_ideas WHERE title LIKE '%Park%' OR title LIKE '%Hike%' ON CONFLICT DO NOTHING;