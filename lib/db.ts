import Dexie, { Table } from "dexie";
import { Entry, Professional } from "./types";

class LocalDB extends Dexie {
  entries!: Table<Entry, string>;
  professionals!: Table<Professional, string>;

  constructor() {
    super("controlOncoPapa");
    this.version(1).stores({
      entries: "id, type, dateTime, status, professionalId",
      professionals: "id, name, specialty"
    });
  }
}

export const localDB = new LocalDB();
