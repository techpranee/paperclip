-- Remove host-local instructions paths from existing agents.
-- Matches paths that begin with /Users/, /home/, /root/, or Windows drive prefixes.
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/cleanup-host-instructions-paths.sql

BEGIN;

-- 1) Dry-run summary
SELECT
  COUNT(*) FILTER (
    WHERE COALESCE(adapter_config->>'instructionsFilePath', '') ~ '^(\/Users\/|\/home\/|\/root\/|[A-Za-z]:[\\/])'
  ) AS instructions_file_path_matches,
  COUNT(*) FILTER (
    WHERE COALESCE(adapter_config->>'agentsMdPath', '') ~ '^(\/Users\/|\/home\/|\/root\/|[A-Za-z]:[\\/])'
  ) AS agents_md_path_matches,
  COUNT(*) AS total_agents
FROM agents;

-- 2) Preview affected rows
SELECT
  id,
  name,
  adapter_type,
  adapter_config->>'instructionsFilePath' AS instructions_file_path,
  adapter_config->>'agentsMdPath' AS agents_md_path
FROM agents
WHERE
  COALESCE(adapter_config->>'instructionsFilePath', '') ~ '^(\/Users\/|\/home\/|\/root\/|[A-Za-z]:[\\/])'
  OR COALESCE(adapter_config->>'agentsMdPath', '') ~ '^(\/Users\/|\/home\/|\/root\/|[A-Za-z]:[\\/])'
ORDER BY updated_at DESC NULLS LAST;

-- 3) Apply cleanup (key-by-key, only when matching host-local patterns)
WITH first_pass AS (
  SELECT
    id,
    CASE
      WHEN COALESCE(adapter_config->>'instructionsFilePath', '') ~ '^(\/Users\/|\/home\/|\/root\/|[A-Za-z]:[\\/])'
        THEN adapter_config - 'instructionsFilePath'
      ELSE adapter_config
    END AS cfg
  FROM agents
), second_pass AS (
  SELECT
    id,
    CASE
      WHEN COALESCE(cfg->>'agentsMdPath', '') ~ '^(\/Users\/|\/home\/|\/root\/|[A-Za-z]:[\\/])'
        THEN cfg - 'agentsMdPath'
      ELSE cfg
    END AS new_cfg
  FROM first_pass
), updated AS (
  UPDATE agents a
  SET adapter_config = s.new_cfg,
      updated_at = NOW()
  FROM second_pass s
  WHERE a.id = s.id
    AND a.adapter_config IS DISTINCT FROM s.new_cfg
  RETURNING a.id, a.name, a.adapter_type
)
SELECT COUNT(*) AS updated_agents FROM updated;

COMMIT;
