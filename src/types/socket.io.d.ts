import type { Session } from "better-auth";

declare module "socket.io" {
  interface Socket {
    user: Session["user"];
    session: Session["session"];
  }
}
