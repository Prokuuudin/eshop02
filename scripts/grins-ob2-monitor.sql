-- Run ONLY against the approved isolated OB2 database, with monitoring rights.
SELECT clock_timestamp() AS sampled_at,pid,application_name,state,xact_start,
       wait_event_type,wait_event
FROM pg_stat_activity WHERE datname=current_database() ORDER BY pid;
SELECT l.pid,l.locktype,l.mode,l.granted,l.relation::regclass AS relation
FROM pg_locks l JOIN pg_stat_activity a USING(pid)
WHERE a.datname=current_database() ORDER BY l.pid,l.locktype;
SELECT count(*) AS orders FROM "Order";
SELECT id,stock,revision,price FROM "Product" WHERE id LIKE 'ob2-%' ORDER BY id;
SELECT id,status,"stockReservationStatus","paymentStatus" FROM "Order" ORDER BY id;
SELECT pg_current_wal_lsn() AS wal_position;
