import { getSql } from "../src/db/client";
import { ensureSchema } from "../src/db/schema";

await ensureSchema();

const sql = getSql();

const users = await sql<{ id: number; username: string; name: string; role: string }[]>`
  select id, username, name, role from users order by id
`;
const guests = await sql<{ id: number; name: string; room: string | null; kind: string }[]>`
  select id, name, room, kind from guests order by id
`;
const devices = await sql<{ id: number; name: string; ip: string; port: number }[]>`
  select id, name, ip, port from devices order by id
`;

console.log(
  "Users:",
  users.map((user) => ({ id: user.id, username: user.username, name: user.name, role: user.role })),
);
console.log(
  "People:",
  guests.map((guest) => ({ id: guest.id, name: guest.name, room: guest.room, kind: guest.kind })),
);
console.log(
  "Devices:",
  devices.map((device) => ({ id: device.id, name: device.name, ip: device.ip, port: device.port })),
);
await sql.end({ timeout: 2 });
