-- Migration: Simplify lead statuses to 4 values
-- New statuses: חדש, מעקב, מתאים, לא רלוונטי
-- Map all old statuses to appropriate new ones

UPDATE leads SET status = 'מעקב'       WHERE status IN ('מעורב', 'בסינון');
UPDATE leads SET status = 'מתאים'      WHERE status IN ('התקבל', 'סיום העסקה');
UPDATE leads SET status = 'לא רלוונטי' WHERE status = 'נדחה';

-- Any remaining unrecognized statuses → חדש
UPDATE leads SET status = 'חדש'
  WHERE status NOT IN ('חדש', 'מעקב', 'מתאים', 'לא רלוונטי');
