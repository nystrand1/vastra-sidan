import { cn } from "~/lib/utils";

interface NonRefundableNoticeProps {
  className?: string;
}

export const NonRefundableNotice = ({ className }: NonRefundableNoticeProps) => {
  return (
    <div className={cn("rounded-md border p-2", className)}>
      <p className="font-bold">Ej återbetalningsbar</p>
      <p>Den här resan går inte att avboka och pengarna betalas inte tillbaka.</p>
    </div>
  );
};
