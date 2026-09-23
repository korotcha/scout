CREATE TRIGGER candidate_screening_insert AFTER INSERT ON candidates
WHEN NEW.query_key <> '' AND COALESCE(json_extract(NEW.content_json, '$.manualBlock'), 0) = 0
BEGIN
  INSERT INTO screener_marks(context_key, query_key, query, subject, status, updated_by, updated_at)
  VALUES(NEW.context_key, NEW.query_key, NEW.query, NEW.subject,
    CASE WHEN NEW.status = 'rejected' THEN 'excluded' ELSE 'shortlisted' END, NEW.updated_by, NEW.updated_at)
  ON CONFLICT(context_key, query_key) DO UPDATE SET query=excluded.query, subject=excluded.subject,
    status=excluded.status, updated_by=excluded.updated_by, updated_at=excluded.updated_at
  WHERE screener_marks.status <> excluded.status;
END;
--> statement-breakpoint
CREATE TRIGGER candidate_screening_update AFTER UPDATE OF status, query, query_key, subject ON candidates
WHEN NEW.query_key <> '' AND COALESCE(json_extract(NEW.content_json, '$.manualBlock'), 0) = 0
BEGIN
  INSERT INTO screener_marks(context_key, query_key, query, subject, status, updated_by, updated_at)
  VALUES(NEW.context_key, NEW.query_key, NEW.query, NEW.subject,
    CASE WHEN NEW.status = 'rejected' THEN 'excluded' ELSE 'shortlisted' END, NEW.updated_by, NEW.updated_at)
  ON CONFLICT(context_key, query_key) DO UPDATE SET query=excluded.query, subject=excluded.subject,
    status=excluded.status, updated_by=excluded.updated_by, updated_at=excluded.updated_at
  WHERE screener_marks.status <> excluded.status;
END;
--> statement-breakpoint
CREATE TRIGGER screening_candidate_insert AFTER INSERT ON screener_marks
WHEN NEW.status IN ('shortlisted', 'excluded')
BEGIN
  UPDATE candidates SET
    status = CASE WHEN NEW.status = 'excluded' THEN 'rejected' WHEN analysis_passed = 1 THEN 'sourcing' ELSE 'analysis' END,
    revision = revision + 1, updated_by = NEW.updated_by, updated_at = NEW.updated_at,
    history_json = json_insert(history_json, '$[#]', json_object(
      'at', NEW.updated_at, 'actor', NEW.updated_by,
      'action', CASE WHEN NEW.status = 'excluded' THEN 'reject' ELSE 'resume' END,
      'status', CASE WHEN NEW.status = 'excluded' THEN 'rejected' WHEN analysis_passed = 1 THEN 'sourcing' ELSE 'analysis' END,
      'revision', revision + 1,
      'note', CASE WHEN NEW.status = 'excluded' THEN 'Исключено при отборе в скринере' ELSE 'Возвращено в чистовик' END))
  WHERE context_key = NEW.context_key AND query_key = NEW.query_key AND subject = NEW.subject
    AND COALESCE(json_extract(content_json, '$.manualBlock'), 0) = 0
    AND ((NEW.status = 'excluded' AND status <> 'rejected') OR (NEW.status = 'shortlisted' AND status = 'rejected'));
END;
--> statement-breakpoint
CREATE TRIGGER screening_candidate_update AFTER UPDATE OF status ON screener_marks
WHEN NEW.status IN ('shortlisted', 'excluded')
BEGIN
  UPDATE candidates SET
    status = CASE WHEN NEW.status = 'excluded' THEN 'rejected' WHEN analysis_passed = 1 THEN 'sourcing' ELSE 'analysis' END,
    revision = revision + 1, updated_by = NEW.updated_by, updated_at = NEW.updated_at,
    history_json = json_insert(history_json, '$[#]', json_object(
      'at', NEW.updated_at, 'actor', NEW.updated_by,
      'action', CASE WHEN NEW.status = 'excluded' THEN 'reject' ELSE 'resume' END,
      'status', CASE WHEN NEW.status = 'excluded' THEN 'rejected' WHEN analysis_passed = 1 THEN 'sourcing' ELSE 'analysis' END,
      'revision', revision + 1,
      'note', CASE WHEN NEW.status = 'excluded' THEN 'Исключено при отборе в скринере' ELSE 'Возвращено в чистовик' END))
  WHERE context_key = NEW.context_key AND query_key = NEW.query_key AND subject = NEW.subject
    AND COALESCE(json_extract(content_json, '$.manualBlock'), 0) = 0
    AND ((NEW.status = 'excluded' AND status <> 'rejected') OR (NEW.status = 'shortlisted' AND status = 'rejected'));
END;
--> statement-breakpoint
