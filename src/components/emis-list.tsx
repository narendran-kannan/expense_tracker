"use client";

import { useState } from "react";
import type { EmiDTO } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CalendarClock, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function EmiCard({ emi }: { emi: EmiDTO }) {
  const [open, setOpen] = useState(false);
  const pct =
    emi.tenureMonths > 0 ? (emi.paidCount / emi.tenureMonths) * 100 : 0;

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">{emi.merchant}</span>
              {emi.complete ? (
                <Badge variant="secondary" className="text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Completed
                </Badge>
              ) : (
                <Badge variant="default" className="text-xs">
                  <CalendarClock className="mr-1 h-3 w-3" />
                  Active
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {emi.subcategory
                  ? `${emi.category} / ${emi.subcategory}`
                  : emi.category}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatINR(emi.amount)} over {emi.tenureMonths} months ·{" "}
              {formatINR(emi.monthlyAmount)}/mo · {emi.startLabel} –{" "}
              {emi.endLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">
              {emi.paidCount} <span className="text-muted-foreground">of</span>{" "}
              {emi.tenureMonths}
            </p>
            <p className="text-xs text-muted-foreground">installments paid</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Progress value={pct} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              Paid:{" "}
              <span className="font-medium text-foreground">
                {formatINR(emi.paidAmount)}
              </span>
            </span>
            <span>
              Remaining:{" "}
              <span className="font-medium text-foreground">
                {formatINR(emi.remainingAmount)}
              </span>
            </span>
          </div>
        </div>

        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            {open ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {open ? "Hide" : "Show"} monthly schedule
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emi.schedule.map((s) => (
                  <TableRow key={s.index} className={s.paid ? "" : "opacity-60"}>
                    <TableCell className="text-muted-foreground">
                      {s.installmentNumber}
                    </TableCell>
                    <TableCell>{s.label}</TableCell>
                    <TableCell className="font-medium">
                      {formatINR(s.amount)}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.paid ? (
                        <Badge variant="secondary" className="text-xs">
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Upcoming
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
