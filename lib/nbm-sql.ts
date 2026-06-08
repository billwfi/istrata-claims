import * as sql from "mssql"
import { createHash } from "crypto"

const pools: Record<string, Promise<sql.ConnectionPool>> = {}
const DEFAULT_NBM_SERVER = "64.27.41.252"
const DEFAULT_NBM_USER = "claudeservices"
const DEFAULT_NBM_DATABASE = "NBM"

function getNbmDatabase() {
  return process.env.NBM_MSSQL_DATABASE || DEFAULT_NBM_DATABASE
}

function getPasswordHash(password: string) {
  return createHash("sha256").update(password).digest("hex").slice(0, 16)
}

function getConfig(database = getNbmDatabase(), passwordOverride?: string | null): sql.config {
  const server = process.env.MSSQL_SERVER || DEFAULT_NBM_SERVER
  const user = process.env.MSSQL_USER || DEFAULT_NBM_USER
  const password = passwordOverride || process.env.MSSQL_PASSWORD

  if (!server || !user || !password) {
    throw new Error("Missing SQL Server environment variables")
  }

  if (database !== "NBM") {
    throw new Error("NBM workflow writes are only allowed against the NBM database")
  }

  return {
    server,
    user,
    password,
    database,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  }
}

export async function getNbmPool(passwordOverride?: string | null) {
  const database = getNbmDatabase()
  const config = getConfig(database, passwordOverride)
  const poolKey = [
    config.server,
    config.user,
    database,
    getPasswordHash(String(config.password)),
  ].join("|")

  if (!pools[poolKey]) {
    pools[poolKey] = new sql.ConnectionPool(config).connect()
  }
  return pools[poolKey]
}

export function hasNbmSqlEnvironmentPassword() {
  return Boolean(process.env.MSSQL_PASSWORD)
}

export async function testNbmConnection(passwordOverride?: string | null) {
  const pool = await getNbmPool(passwordOverride)
  await pool.request().query("SELECT 1 AS ok")
}

export { sql }
