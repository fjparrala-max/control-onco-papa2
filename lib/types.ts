export type EntryType = "med" | "chemo" | "exam" | "control";
export type EntryStatus = "planned" | "done" | "cancelled";

export type Attachment = {
  name: string;
  url: string;
  mime: string;
  uploadedAt: string;
};

export type Professional = {
  id: string;
  name: string;
  specialty: string;
  center?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Entry = {
  id: string;
  type: EntryType;
  title: string;
  dateTime: string;
  endDateTime?: string;
  doseAmount?: number;
  doseUnit?: string;
  status: EntryStatus;
  professionalId?: string;
  location?: string;
  notes?: string;
  attachments?: Attachment[];
  createdAt: string;
  updatedAt: string;
};
