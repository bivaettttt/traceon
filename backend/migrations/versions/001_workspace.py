from alembic import op

revision = "001"
down_revision = None


def upgrade():
    op.execute("""
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text UNIQUE NOT NULL,
 name text NOT NULL, password text NOT NULL, admin boolean DEFAULT false NOT NULL
);
CREATE TABLE sessions (
 digest text PRIMARY KEY, actor uuid NOT NULL REFERENCES users, expires timestamptz NOT NULL
);
CREATE TABLE projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL, name text NOT NULL,
 description text NOT NULL, owner uuid NOT NULL REFERENCES users, archived boolean NOT NULL DEFAULT false,
 epoch bigint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE members (
 project_id uuid REFERENCES projects, actor uuid REFERENCES users,
 role text NOT NULL CHECK(role IN ('ANALYST','REVIEWER','PROJECT_MANAGER')),
 PRIMARY KEY(project_id,actor)
);
CREATE TABLE nodes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects,
 code text NOT NULL, kind text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
 source text NOT NULL DEFAULT '', release text NOT NULL DEFAULT '', archived boolean NOT NULL DEFAULT false,
 UNIQUE(project_id,code), UNIQUE(project_id,id)
);
CREATE TABLE changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects,
 node_id uuid NOT NULL, author uuid NOT NULL REFERENCES users,
 title text NOT NULL, reason text NOT NULL, proposal text NOT NULL, risk text NOT NULL,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN
 ('NEW','UNDER_ANALYSIS','IMPACT_REVIEW','APPROVED','REJECTED','IMPLEMENTED','VERIFIED','CLOSED')),
 evidence text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,node_id) REFERENCES nodes(project_id,id), UNIQUE(project_id,id)
);
CREATE TABLE versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
 node_id uuid NOT NULL, number int NOT NULL CHECK(number>0), revision int NOT NULL DEFAULT 1,
 author uuid NOT NULL REFERENCES users, reviewer uuid REFERENCES users, change_id uuid,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','IN_REVIEW','APPROVED','CHANGES_REQUESTED')),
 title text NOT NULL, description text NOT NULL, rationale text NOT NULL,
 priority text NOT NULL CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
 source text NOT NULL, criteria text NOT NULL, rules text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(project_id,node_id) REFERENCES nodes(project_id,id),
 FOREIGN KEY(project_id,change_id) REFERENCES changes(project_id,id),
 UNIQUE(node_id,number), UNIQUE(node_id,id), CHECK(reviewer IS NULL OR reviewer<>author)
);
CREATE TABLE reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, version_id uuid NOT NULL UNIQUE REFERENCES versions,
 reviewer uuid NOT NULL REFERENCES users, decision text NOT NULL CHECK(decision IN ('APPROVED','CHANGES_REQUESTED')),
 comment text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL,
 source_id uuid NOT NULL, target_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN
 ('REFINES','DERIVES_FROM','DEPENDS_ON','IMPLEMENTED_BY','VERIFIED_BY','CONSTRAINS','RELATES_TO')),
 source_version uuid, target_version uuid, active boolean NOT NULL DEFAULT true,
 CHECK(source_id<>target_id),
 FOREIGN KEY(project_id,source_id) REFERENCES nodes(project_id,id),
 FOREIGN KEY(project_id,target_id) REFERENCES nodes(project_id,id),
 FOREIGN KEY(source_id,source_version) REFERENCES versions(node_id,id),
 FOREIGN KEY(target_id,target_version) REFERENCES versions(node_id,id)
);
CREATE UNIQUE INDEX active_link ON links(project_id,source_id,target_id,kind) WHERE active;
CREATE TABLE analyses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, change_id uuid,
 node_id uuid NOT NULL, version_id uuid NOT NULL, epoch bigint NOT NULL, snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(project_id,change_id) REFERENCES changes(project_id,id),
 FOREIGN KEY(project_id,node_id) REFERENCES nodes(project_id,id),
 FOREIGN KEY(node_id,version_id) REFERENCES versions(node_id,id)
);
CREATE TABLE impact_decisions (
 analysis_id uuid REFERENCES analyses, node_id uuid REFERENCES nodes, reviewer uuid NOT NULL REFERENCES users,
 decision text NOT NULL CHECK(decision IN ('CONFIRMED','DISMISSED')), comment text NOT NULL,
 PRIMARY KEY(analysis_id,node_id)
);
CREATE TABLE baselines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid REFERENCES projects NOT NULL,
 name text NOT NULL, author uuid NOT NULL REFERENCES users, snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), UNIQUE(project_id,name)
);
CREATE TABLE audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, project_id uuid REFERENCES projects,
 actor uuid NOT NULL REFERENCES users, action text NOT NULL, object_id uuid NOT NULL,
 detail text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Immutable record' USING ERRCODE='23514';
END $$;
CREATE TRIGGER protect_baseline BEFORE UPDATE OR DELETE ON baselines FOR EACH ROW EXECUTE FUNCTION immutable();
CREATE TRIGGER protect_analysis BEFORE UPDATE OR DELETE ON analyses FOR EACH ROW EXECUTE FUNCTION immutable();
CREATE TRIGGER protect_review BEFORE UPDATE OR DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION immutable();
CREATE TRIGGER protect_audit BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION immutable();
CREATE FUNCTION version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Version deletion forbidden' USING ERRCODE='23514';
 END IF;
 IF OLD.status IN ('APPROVED','CHANGES_REQUESTED')
   OR (OLD.status='IN_REVIEW' AND (
      NEW.status NOT IN ('APPROVED','CHANGES_REQUESTED')
      OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status')
   )) OR (OLD.status='DRAFT' AND NEW.status NOT IN ('DRAFT','IN_REVIEW')) THEN
   RAISE EXCEPTION 'Reviewed version is sealed' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seal_version BEFORE UPDATE OR DELETE ON versions FOR EACH ROW EXECUTE FUNCTION version_guard();
""")


def downgrade():
    op.execute(
        "DROP TABLE audit,baselines,impact_decisions,analyses,links,reviews,versions,changes,nodes,members,sessions,projects,users"
    )
    op.execute("DROP FUNCTION immutable(), version_guard()")
