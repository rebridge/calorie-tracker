import { useParams } from "react-router";

export function DayPage() {
  const { date } = useParams();
  return <p className="text-muted-foreground">Day view for {date ?? "today"} coming soon.</p>;
}
