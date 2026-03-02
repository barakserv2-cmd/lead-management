export const dynamic = "force-dynamic";

import { getUsers } from "./actions";
import { UsersContent } from "./users-content";

export default async function UsersPage() {
  const { users } = await getUsers();
  return <UsersContent users={users} />;
}
