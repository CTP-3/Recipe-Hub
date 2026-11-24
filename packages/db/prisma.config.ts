import { defineConfig } from "prisma/config";
import { LOCAL_DEV_URL } from "./src/client";

const url = process.env.DATABASE_URL ?? LOCAL_DEV_URL;
process.env.DATABASE_URL = url;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url,
  },
});
