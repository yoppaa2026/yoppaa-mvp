-- SEED communes province de Namur (38) - source bpost officielle (opendatasoft, MAJ 2025)
-- Idempotent : contrainte unique(nom) + upsert. Ne touche PAS active/seuil des communes existantes.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='communes_nom_key') THEN
    ALTER TABLE communes ADD CONSTRAINT communes_nom_key UNIQUE (nom);
  END IF;
END $$;

INSERT INTO communes (nom, codes_postaux, province, region, centre_lat, centre_lng, active, seuil_preinscrits) VALUES
  ('Andenne', ARRAY['5300'], 'Namur', 'Wallonie', 50.4710, 5.0457, false, 10),
  ('Anhée', ARRAY['5537'], 'Namur', 'Wallonie', 50.3336, 4.7968, false, 10),
  ('Assesse', ARRAY['5330','5332','5333','5334','5336'], 'Namur', 'Wallonie', 50.3744, 5.0032, false, 10),
  ('Beauraing', ARRAY['5570','5571','5572','5573','5574','5576'], 'Namur', 'Wallonie', 50.1007, 4.9987, false, 10),
  ('Bièvre', ARRAY['5555'], 'Namur', 'Wallonie', 49.9136, 4.9983, false, 10),
  ('Cerfontaine', ARRAY['5630'], 'Namur', 'Wallonie', 50.1901, 4.4339, false, 10),
  ('Ciney', ARRAY['5590'], 'Namur', 'Wallonie', 50.2562, 5.1228, false, 10),
  ('Couvin', ARRAY['5660'], 'Namur', 'Wallonie', 50.0259, 4.5212, false, 10),
  ('Dinant', ARRAY['5500','5501','5502','5503','5504'], 'Namur', 'Wallonie', 50.2609, 4.9673, false, 10),
  ('Doische', ARRAY['5680'], 'Namur', 'Wallonie', 50.1390, 4.6711, false, 10),
  ('Éghezée', ARRAY['5310'], 'Namur', 'Wallonie', 50.5896, 4.9097, false, 10),
  ('Fernelmont', ARRAY['5380'], 'Namur', 'Wallonie', 50.5465, 4.9828, false, 10),
  ('Floreffe', ARRAY['5150'], 'Namur', 'Wallonie', 50.4212, 4.7775, false, 10),
  ('Florennes', ARRAY['5620','5621'], 'Namur', 'Wallonie', 50.2620, 4.6240, false, 10),
  ('Fosses-la-Ville', ARRAY['5070'], 'Namur', 'Wallonie', 50.3948, 4.6915, false, 10),
  ('Gedinne', ARRAY['5575'], 'Namur', 'Wallonie', 49.9930, 4.8854, false, 10),
  ('Gembloux', ARRAY['5030','5031','5032'], 'Namur', 'Wallonie', 50.5550, 4.7237, false, 10),
  ('Gesves', ARRAY['5340'], 'Namur', 'Wallonie', 50.4077, 5.0705, false, 10),
  ('Hamois', ARRAY['5360','5361','5362','5363','5364'], 'Namur', 'Wallonie', 50.3387, 5.1412, false, 10),
  ('Hastière', ARRAY['5540','5541','5542','5543','5544'], 'Namur', 'Wallonie', 50.1873, 4.8287, false, 10),
  ('Havelange', ARRAY['5370','5372','5374','5376'], 'Namur', 'Wallonie', 50.3586, 5.2835, false, 10),
  ('Houyet', ARRAY['5560','5561','5562','5563','5564'], 'Namur', 'Wallonie', 50.1834, 5.0360, false, 10),
  ('Jemeppe-sur-Sambre', ARRAY['5190'], 'Namur', 'Wallonie', 50.4588, 4.6893, false, 10),
  ('La Bruyère', ARRAY['5080','5081'], 'Namur', 'Wallonie', 50.5275, 4.7992, false, 10),
  ('Mettet', ARRAY['5640','5641','5644','5646'], 'Namur', 'Wallonie', 50.3009, 4.6846, false, 10),
  ('Namur', ARRAY['5000','5001','5002','5003','5004','5010','5012','5020','5021','5022','5024','5100','5101'], 'Namur', 'Wallonie', 50.4729, 4.8778, false, 10),
  ('Ohey', ARRAY['5350','5351','5352','5353','5354'], 'Namur', 'Wallonie', 50.4467, 5.1730, false, 10),
  ('Onhaye', ARRAY['5520','5521','5522','5523','5524'], 'Namur', 'Wallonie', 50.2577, 4.8098, false, 10),
  ('Philippeville', ARRAY['5600'], 'Namur', 'Wallonie', 50.1629, 4.5719, false, 10),
  ('Profondeville', ARRAY['5170'], 'Namur', 'Wallonie', 50.3884, 4.8264, false, 10),
  ('Rochefort', ARRAY['5580','5589'], 'Namur', 'Wallonie', 50.1524, 5.2124, false, 10),
  ('Sambreville', ARRAY['5060'], 'Namur', 'Wallonie', 50.4462, 4.6330, false, 10),
  ('Sombreffe', ARRAY['5140'], 'Namur', 'Wallonie', 50.5445, 4.6042, false, 10),
  ('Somme-Leuze', ARRAY['5377'], 'Namur', 'Wallonie', 50.2963, 5.3032, false, 10),
  ('Viroinval', ARRAY['5670'], 'Namur', 'Wallonie', 50.0613, 4.6076, false, 10),
  ('Vresse-sur-Semois', ARRAY['5550'], 'Namur', 'Wallonie', 49.8122, 4.9131, false, 10),
  ('Walcourt', ARRAY['5650','5651'], 'Namur', 'Wallonie', 50.2719, 4.4468, false, 10),
  ('Yvoir', ARRAY['5530'], 'Namur', 'Wallonie', 50.3360, 4.9807, false, 10)
ON CONFLICT (nom) DO UPDATE SET codes_postaux=EXCLUDED.codes_postaux, province=EXCLUDED.province, region=EXCLUDED.region;
