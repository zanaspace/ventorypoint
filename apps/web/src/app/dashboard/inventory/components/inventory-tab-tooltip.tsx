"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, Sparkles, CheckCircle2, ArrowRight, BookOpen } from "lucide-react";
import { useDropdownPosition } from "@/components/ui/use-dropdown-position";

export type InventoryGuideKey =
  | "balances"
  | "containers"
  | "lots"
  | "serials"
  | "adjustments"
  | "transactions"
  | "where_is_it"
  | "inbound_receipt"
  | "new_lpn"
  | "fefo_expiry"
  | "reconcile";

export interface InventoryGuideContent {
  title: string;
  badge: string;
  simpleMeaning: string;
  everydayAnalogy: string;
  exampleScenario: {
    heading: string;
    flow: string[];
    outcome: string;
  };
  howToSteps: string[];
}

export const INVENTORY_GUIDES: Record<InventoryGuideKey, InventoryGuideContent> = {
  balances: {
    title: "Balances by SKU & Location",
    badge: "Tab 1 • Current Stock",
    simpleMeaning:
      "Shows exactly how many items you have in stock right now and which shelf/rack each item is sitting on.",
    everydayAnalogy:
      "Think of this as your live warehouse map — tells you 'What product do we have, where is it parked, and how many are ready to sell?'",
    exampleScenario: {
      heading: "Example: Checking & Moving Stock",
      flow: ["PS 5 Games", "Rack: MYA-W1-ZA", "20 Available"],
      outcome:
        "If 2 boxes get wet, click the 3 dots (⋮) on that row → 'Change Status' → move 2 units to 'Damaged' so nobody ships them.",
    },
    howToSteps: [
      "Click 'Inbound Receipt' (green button above) to add new stock to a rack.",
      "Use the search box to find any product by name, SKU, or rack code.",
      "Click the 3 dots (⋮) at the right end of any row to Move stock to another rack, Adjust quantity, or Change status (Hold/Damaged).",
    ],
  },
  containers: {
    title: "Containers & LPNs (Pallets / Boxes)",
    badge: "Tab 2 • Movable Pallets",
    simpleMeaning:
      "An LPN (License Plate Number) is simply a barcode sticker placed on a pallet, tote, or big master carton so you can move everything inside it at once.",
    everydayAnalogy:
      "Like a car license plate — instead of moving 100 loose items one by one, you put them on Pallet 'LPN-001' and move the whole pallet in 1 click.",
    exampleScenario: {
      heading: "Example: Moving a Full Pallet",
      flow: ["Pallet LPN-101", "Holds 50 Fans", "Move to Staging Bay"],
      outcome:
        "When you move LPN-101 to a new rack, all 50 Fans inside it automatically move to that new rack together.",
    },
    howToSteps: [
      "Click '+ New LPN' above (or type a Pallet LPN during Inbound Receipt) to create a pallet/box ID.",
      "Assign the LPN to a rack location in your facility.",
      "Click the 3 dots (⋮) on any container to relocate the entire pallet or print its label.",
    ],
  },
  lots: {
    title: "Lots & Expiry (FEFO)",
    badge: "Tab 3 • Batches & Expiry Dates",
    simpleMeaning:
      "Tracks products that come in batches ('Lots') and have expiration dates (like food, drinks, medicine, or cosmetics). FEFO means 'First Expired, First Out'.",
    everydayAnalogy:
      "Just like milk at a supermarket — you always sell the batch that expires next month before the batch that expires next year.",
    exampleScenario: {
      heading: "Example: Managing Perishable Batches",
      flow: ["Biscuits • Lot-JAN", "Expires: May 10", "Pick First (FEFO)"],
      outcome:
        "The system highlights batches expiring soon in yellow and automatically blocks expired batches in red so staff never ship expired goods.",
    },
    howToSteps: [
      "When receiving Lot-tracked items in 'Inbound Receipt', enter the Lot/Batch number and Expiry Date.",
      "Open this tab anytime to see which batches are Active, Expiring Soon (≤ 30 days), or Expired.",
      "Click 'Recall / Hold Lot' on any batch if a manufacturer reports a quality problem with that batch.",
    ],
  },
  serials: {
    title: "Unique Serials (1-by-1 Item Tracking)",
    badge: "Tab 4 • High-Value Units",
    simpleMeaning:
      "Tracks high-value electronics or equipment where every single unit has its own unique Serial Number or IMEI.",
    everydayAnalogy:
      "Even if you have 10 identical iPhone 13 boxes, each phone has its own unique Serial/IMEI number so you know exactly which unit went to which customer.",
    exampleScenario: {
      heading: "Example: Tracking Individual Electronics",
      flow: ["iPhone 13", "SN: IPHONE-13-SN-001", "Rack: MYA-W1-ZA"],
      outcome:
        "If a customer returns one phone, you can look up its exact Serial Number to see when it arrived and every rack it ever touched.",
    },
    howToSteps: [
      "Set a product's Tracking Mode to 'Serial' in the Product Catalog.",
      "When receiving that product, scan or enter the unique serial number for each unit.",
      "Click 'View History' on any serial row here to see that specific unit's full life story.",
    ],
  },
  adjustments: {
    title: "Approval Queue (Manager Sign-Off)",
    badge: "Tab 5 • Cycle Count & Edits",
    simpleMeaning:
      "When warehouse staff report missing, found, or damaged items above your safety threshold, those quantity changes wait here for a manager to Approve or Reject.",
    everydayAnalogy:
      "Like a bank dual-approval check — prevents someone from accidentally (or Dishonestly) wiping out 500 units of inventory without a supervisor reviewing it.",
    exampleScenario: {
      heading: "Example: Approving a Stock Count Difference",
      flow: ["Worker counts -15 units", "Reason: Damaged", "Manager Approves"],
      outcome:
        "Once you click 'Approve', the live stock balance updates immediately and records who approved it.",
    },
    howToSteps: [
      "When someone adjusts stock in Tab 1 ('Adjust Quantity'), large changes appear here as 'Pending'.",
      "Review the SKU, quantity change (+ or -), reason code, and who requested it.",
      "Click 'Approve' to apply the change to live stock, or 'Reject' to cancel it.",
    ],
  },
  transactions: {
    title: "Ledger Audit Trail (Permanent History)",
    badge: "Tab 6 • Black-Box Security Log",
    simpleMeaning:
      "A permanent, uneditable diary of every single stock movement — every receipt, rack move, status change, and quantity adjustment ever made.",
    everydayAnalogy:
      "Like a bank statement — nobody can delete or fake past entries. Every change shows the exact time, user, before-quantity, change, and after-quantity.",
    exampleScenario: {
      heading: "Example: Investigating Missing Stock",
      flow: ["10:15 AM • Inbound +20", "02:30 PM • Moved Rack", "04:00 PM • Damaged -2"],
      outcome:
        "You can trace why a product now has 18 units instead of 20 in seconds.",
    },
    howToSteps: [
      "Open this tab whenever you want to see recent activity across your warehouse.",
      "Use the search box to filter by a specific SKU, Lot, or Rack code.",
      "Check the 'Delta' (+ / -) and 'New Balance' columns to see how stock changed step by step.",
    ],
  },
  where_is_it: {
    title: '"Where Is It?" Instant Scanner',
    badge: "Quick Action • Instant Finder",
    simpleMeaning:
      "Scan or type any barcode, SKU, Pallet LPN, Lot number, or Serial number to immediately see every rack where it is stored.",
    everydayAnalogy:
      "Like 'Find My Phone' for your warehouse — type any code and it tells you the exact rack and bin in 1 second.",
    exampleScenario: {
      heading: "Example: Finding a Product Fast",
      flow: ["Type 'PS-5-GAMES'", "Instant Search", "Shows Rack MYA-W1-ZA (20 units)"],
      outcome: "No need to click through tabs — works for SKUs, LPNs, Lots, and Serials all in one box.",
    },
    howToSteps: [
      "Click '\"Where Is It?\" Scan'.",
      "Scan a barcode with a scanner or type the code/name.",
      "See the exact facility, rack location, and available quantity immediately.",
    ],
  },
  inbound_receipt: {
    title: "Inbound Receipt (Add New Stock)",
    badge: "Quick Action • Receive Goods",
    simpleMeaning:
      "Use this whenever a truck, supplier, or delivery arrives at your warehouse and you want to add those items into your inventory.",
    everydayAnalogy:
      "Like checking in groceries when you get home — you pick which facility (e.g. Myaflower) and which shelf/rack you are putting them on.",
    exampleScenario: {
      heading: "Example: Receiving a Delivery",
      flow: ["Facility: Myaflower", "Rack: MYA-W1-ZA", "SKU: Fan × 50 units"],
      outcome: "Clicking 'Receive Stock into Ledger' immediately adds 50 Fans to Myaflower on that rack.",
    },
    howToSteps: [
      "Click 'Inbound Receipt' and select your Receiving Facility & Default Staging Rack.",
      "Choose one or more Product SKUs and enter the Quantity received.",
      "Click 'Receive Stock into Ledger' to add them to your live inventory.",
    ],
  },
  new_lpn: {
    title: "New LPN (Create Pallet / Box ID)",
    badge: "Quick Action • Create Container",
    simpleMeaning:
      "Creates a new empty Pallet, Tote, or Master Carton barcode ID so you can group items together at a rack location.",
    everydayAnalogy:
      "Like labeling a moving box 'BOX-01' before packing items inside it.",
    exampleScenario: {
      heading: "Example: Setting Up a Pallet",
      flow: ["Click '+ New LPN'", "Auto-Generate Code", "Park at MYA-W1-CAGE-02"],
      outcome: "Your new pallet is now ready to hold stock and be moved around as one unit.",
    },
    howToSteps: [
      "Click '+ New LPN'.",
      "Click 'Auto-Gen' to generate a unique LPN barcode (or type your own).",
      "Choose the container type (Pallet, Tote, Carton) and its starting rack location.",
    ],
  },
  fefo_expiry: {
    title: "FEFO Expiry Check",
    badge: "Quick Action • Auto-Check Dates",
    simpleMeaning:
      "Scans all your Lot-tracked batches right now and automatically moves any batch past its expiration date into 'Expired' status so it cannot be sold.",
    everydayAnalogy:
      "Like a one-click freshness inspector that checks every expiry date label in your warehouse at once.",
    exampleScenario: {
      heading: "Example: Daily Freshness Sweep",
      flow: ["Click 'FEFO Expiry'", "Checks all Lots", "Quarantines expired stock"],
      outcome: "Any expired stock is automatically locked from order picking.",
    },
    howToSteps: [
      "Click 'FEFO Expiry' anytime to run an instant expiration date sweep.",
      "Read the green banner at the top to see how many expired lots were caught.",
    ],
  },
  reconcile: {
    title: "Reconcile Ledger (Self-Audit)",
    badge: "Quick Action • Math Verification",
    simpleMeaning:
      "Double-checks that every current stock balance on Tab 1 matches 100% of the historical math in your Audit Trail (Tab 6).",
    everydayAnalogy:
      "Like balancing your checkbook — adds up every receipt and subtraction since day one to prove your current stock numbers are 100% accurate.",
    exampleScenario: {
      heading: "Example: Verifying Ledger Integrity",
      flow: ["Click 'Reconcile'", "Audits all balances", "'0 Discrepancies Found'"],
      outcome: "Confirms your live inventory numbers match the audit history with zero errors.",
    },
    howToSteps: [
      "Click 'Reconcile' in the top bar.",
      "Wait 1 second for the system to verify all balances in the selected facility.",
    ],
  },
};

interface InventoryHelpTooltipProps {
  guideKey: InventoryGuideKey;
  /** Optional custom styling for the ? icon trigger */
  variant?: "default" | "light";
}

export function InventoryHelpTooltip({ guideKey, variant = "default" }: InventoryHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guide = INVENTORY_GUIDES[guideKey];

  const { style } = useDropdownPosition(triggerRef, isOpen, {
    align: "start",
    width: 360,
    minSpaceBelow: 380,
  });

  const clearCloseTimer = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    clearCloseTimer();
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    clearCloseTimer();
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 140);
  };

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  if (!guide) return null;

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-label={`What is ${guide.title}?`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`inline-flex items-center justify-center rounded-full p-0.5 transition-all cursor-help select-none ${
          variant === "light"
            ? "text-white/80 hover:text-white hover:bg-white/20"
            : isOpen
              ? "text-primary bg-primary/15 scale-110"
              : "text-muted-foreground/75 hover:text-primary hover:bg-primary/10"
        }`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </span>

      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              ...style,
              width: "min(360px, calc(100vw - 16px))",
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onClick={(e) => e.stopPropagation()}
            className="z-[9999] rounded-2xl border border-border bg-surface text-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Top Header Banner */}
            <div className="px-4 py-3 bg-accent/50 border-b border-border flex items-start justify-between gap-2">
              <div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25">
                  <BookOpen className="w-2.5 h-2.5" />
                  {guide.badge}
                </span>
                <h4 className="text-sm font-bold text-foreground mt-1">{guide.title}</h4>
              </div>
            </div>

            {/* Body Content */}
            <div className="p-4 space-y-3.5 text-left whitespace-normal">
              {/* Simple Plain-English Meaning */}
              <div>
                <p className="text-xs leading-relaxed text-foreground font-medium">
                  {guide.simpleMeaning}
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground mt-1.5 italic bg-muted/50 p-2.5 rounded-lg border border-border/60">
                  💡 {guide.everydayAnalogy}
                </p>
              </div>

              {/* Visual Mini-Example Box */}
              <div className="rounded-xl bg-background border border-border p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                  <Sparkles className="w-3 h-3" />
                  <span>{guide.exampleScenario.heading}</span>
                </div>

                {/* Visual Flow Pills */}
                <div className="flex flex-wrap items-center gap-1.5 py-1">
                  {guide.exampleScenario.flow.map((stepText, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <span className="px-2 py-1 rounded-md bg-accent/60 border border-border text-[11px] font-mono font-semibold text-foreground">
                        {stepText}
                      </span>
                      {idx < guide.exampleScenario.flow.length - 1 && (
                        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-muted-foreground leading-snug">
                  {guide.exampleScenario.outcome}
                </p>
              </div>

              {/* How to Do It (Numbered Steps) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <span>How to do it</span>
                </div>
                <ol className="space-y-1.5">
                  {guide.howToSteps.map((step, index) => (
                    <li key={index} className="flex items-start gap-2 text-[11px] text-foreground/90 leading-snug">
                      <span className="w-4 h-4 rounded-full bg-primary/15 text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

