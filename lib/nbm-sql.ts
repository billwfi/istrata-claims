import * as sql from "mssql"

const pools: Record<string, Promise<sql.ConnectionPool>> = {}

function getNbmDatabase() {
  return process.env.NBM_MSSQL_DATABASE || "NBM"
}

function getConfig(database = getNbmDatabase()): sql.config {
  if (!process.env.MSSQL_SERVER || !process.env.MSSQL_USER || !process.env.MSSQL_PASSWORD) {
    throw new Error("Missing SQL Server environment variables")
  }

  if (database !== "NBM") {
    throw new Error("NBM workflow writes are only allowed against the NBM database")
  }

  return {
    server: process.env.MSSQL_SERVER,
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    database,
    options: { encrypt: true, trustServerCertificate: true },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
  }
}

export async function getNbmPool() {
  const database = getNbmDatabase()
  if (!pools[database]) {
    pools[database] = new sql.ConnectionPool(getConfig(database)).connect()
  }
  return pools[database]
}

export { sql }
