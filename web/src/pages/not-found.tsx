import { Link } from "react-router";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <div role="alert" className="space-y-3 py-12 text-center">
      <p className="text-muted-foreground">There's nothing at this address.</p>
      <Link to="/" className={buttonVariants({ variant: "outline", className: "h-11" })}>
        Back to the log
      </Link>
    </div>
  );
}
