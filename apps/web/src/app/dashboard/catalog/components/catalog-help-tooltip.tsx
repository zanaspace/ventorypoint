"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, Sparkles, CheckCircle2, ArrowRight, BookOpen } from "lucide-react";
import { useDropdownPosition } from "@/components/ui/use-dropdown-position";

export type CatalogGuideKey =
  | "general_tab"
  | "advanced_tab"
  | "brand_client"
  | "product_title"
  | "sku_code"
  | "barcode_upc"
  | "barcode_format"
  | "tracking_class"
  | "rotation_rule"
  | "serial_settings"
  | "expiry_required"
  | "initial_stock"
  | "dimensions_weight"
  | "temperature_class"
  | "hazmat_class"
  | "fragile_item"
  | "catalog_status"
  | "barcode_lookup"
  | "import_csv"
  | "export_csv";

export interface CatalogGuideContent {
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

export const CATALOG_GUIDES: Record<CatalogGuideKey, CatalogGuideContent> = {
  general_tab: {
    title: "General & Stock Intake Tab",
    badge: "Tab 1 • Essential Setup",
    simpleMeaning:
      "Contains everything you need to register a new product — its name, SKU code, barcode, how you track it, and optional starting stock.",
    everydayAnalogy:
      "Think of this as creating the product's ID card and optionally putting your first batch onto a warehouse shelf right away.",
    exampleScenario: {
      heading: "Example: 30-Second Product Setup",
      flow: ["Type 'PS5 Pad'", "SKU Auto-Fills", "Tick 'Initial Stock' (20 units)"],
      outcome:
        "Creates the product in your catalog and immediately adds 20 units to your warehouse rack in one click.",
    },
    howToSteps: [
      "Enter the Product Title (the SKU code fills in automatically).",
      "Choose your Tracking Class and Rotation Rule (or leave the defaults for standard items).",
      "Optionally check 'Record Initial Stock on Hand' if you already have units sitting in your warehouse.",
    ],
  },
  advanced_tab: {
    title: "Advanced Specs Tab (Optional)",
    badge: "Tab 2 • Shipping & Storage Specs",
    simpleMeaning:
      "Optional extra details like weight, box dimensions, fridge/freezer requirements, fragile warnings, and customs codes.",
    everydayAnalogy:
      "Like the fine print on a shipping label — you can skip this now and only fill it in if you need shipping weight calculations or special storage rules.",
    exampleScenario: {
      heading: "Example: Heavy or Chilled Goods",
      flow: ["Weight: 10 kg", "Temp: Chilled (2–8°C)", "Tick 'Fragile'"],
      outcome:
        "Helps your staff store the item in the right zone and pack it with bubble wrap.",
    },
    howToSteps: [
      "Click 'Advanced Specs' only if you want to record brand, category, weight, or dimensions.",
      "Select Temperature Class if the item needs refrigeration or freezing.",
      "Tick 'Fragile Item' if packers need to add extra cushioning.",
    ],
  },
  brand_client: {
    title: "Brand Client (Product Owner)",
    badge: "Field • Ownership",
    simpleMeaning:
      "Selects which client account or brand owns this product in your warehouse.",
    everydayAnalogy:
      "If you store goods for multiple businesses (or multiple sub-brands), this keeps Company A's products separate from Company B's products.",
    exampleScenario: {
      heading: "Example: Assigning a Brand",
      flow: ["Select Client Account", "Create Product", "Filtered by Brand"],
      outcome:
        "You can filter your entire Catalog and Inventory Ledger by this client anytime.",
    },
    howToSteps: [
      "Click the dropdown and pick the Brand Client that owns this item.",
      "If you only manage your own company's inventory, leave it on your default client.",
    ],
  },
  product_title: {
    title: "Product Title / Name",
    badge: "Field • Human-Friendly Name",
    simpleMeaning:
      "The clear, everyday name of the product so warehouse staff immediately recognize what is inside the box.",
    everydayAnalogy:
      "Include the size, color, or pack weight in the name so nobody confuses a 70g pack with a 500g pack.",
    exampleScenario: {
      heading: "Example: Writing a Clear Name",
      flow: ["Type 'Indomie Noodles 70g'", "Auto-builds SKU", "Easy to search"],
      outcome:
        "As you type the title, the system automatically generates a clean SKU code for you below.",
    },
    howToSteps: [
      "Type the product name, size, or model (e.g. 'Nikon Camera D850' or 'Biscuits Vanilla 200g').",
      "Watch the SKU Code field below automatically format itself from your title.",
    ],
  },
  sku_code: {
    title: "SKU Code (Stock Keeping Unit)",
    badge: "Field • Unique Warehouse ID",
    simpleMeaning:
      "A short, uppercase code (no spaces) that uniquely identifies this exact product variation across your entire warehouse.",
    everydayAnalogy:
      "Like a username for a product — two products can have similar names, but every product has its own unique SKU code.",
    exampleScenario: {
      heading: "Example: Auto-Generated vs Custom SKU",
      flow: ["Title: 'Royal Rice 10kg'", "Auto SKU: 'ROYAL-RICE-10KG'", "Or type your own"],
      outcome:
        "You can keep the auto-created code or type your own company code (like 'RICE-001').",
    },
    howToSteps: [
      "Let the system auto-create it as you type the Product Title, OR click inside the box to type your own custom code.",
      "If you edited it and want the automatic code back, click 'Re-sync with title'.",
    ],
  },
  barcode_upc: {
    title: "Barcode / EAN / UPC",
    badge: "Field • Scanner Number",
    simpleMeaning:
      "The number printed underneath the black-and-white vertical stripes on the product packaging.",
    everydayAnalogy:
      "Like a supermarket checkout code — when a worker points a barcode scanner at the box, the scanner types these digits in automatically.",
    exampleScenario: {
      heading: "Example: Scanning with a Handheld Gun",
      flow: ["Click inside Barcode box", "Beep product barcode", "Fills '501234567890'"],
      outcome:
        "Once saved, staff can scan this barcode in 'Where Is It?' or 'Inbound Receipt' to find the product instantly.",
    },
    howToSteps: [
      "Click inside this field and scan the product's physical barcode with a USB/Bluetooth scanner, OR type the numbers manually.",
      "Leave blank if your product does not have a barcode yet.",
    ],
  },
  barcode_format: {
    title: "Barcode Format",
    badge: "Field • Symbology Type",
    simpleMeaning:
      "Tells the system what style of barcode is printed on your product packaging.",
    everydayAnalogy:
      "Just like phone numbers have country formats: US/Canada retail items use 12-digit UPC-A, international items use 13-digit EAN-13, and custom warehouse stickers use Code 128.",
    exampleScenario: {
      heading: "Example: Which One Should I Pick?",
      flow: ["12 digits → UPC-A", "13 digits → EAN-13", "Letters & Numbers → Code 128"],
      outcome:
        "Not sure? Leave it on 'UPC-A' for standard retail barcodes or 'Code 128' if you print your own alphanumeric labels.",
    },
    howToSteps: [
      "Choose 'UPC-A (12-digit)' for North American retail barcodes.",
      "Choose 'EAN-13' for international/European 13-digit retail barcodes.",
      "Choose 'Code 128' for warehouse stickers that mix letters and numbers.",
      "Choose 'GTIN-14' for outer master shipping cartons.",
    ],
  },
  tracking_class: {
    title: "Tracking Class (How Strictly We Track It)",
    badge: "Field • Inventory Control Mode",
    simpleMeaning:
      "Decides whether you just count total quantity, track batches with expiry dates, or track every single item 1-by-1 by serial number.",
    everydayAnalogy:
      "You don't track a bag of screws the same way you track an iPhone or fresh milk! Pick the mode that matches the product:",
    exampleScenario: {
      heading: "Quick Guide: Which of the 4 Options to Pick?",
      flow: ["Everyday Goods → Non-Unique", "Food/Meds → Lot/Batch", "Electronics → Serialized"],
      outcome:
        "• Non-Unique: Just count quantity (e.g. 50 Fans). Best for 90% of items.\n• Lot / Batch: Groups items by batch & expiry date.\n• Unique / Serialized: Tracks each unit's IMEI/Serial number.",
    },
    howToSteps: [
      "Keep 'Non-Unique (Standard Quantity)' for normal products where every unit is identical.",
      "Pick 'Lot / Batch-Controlled' for food, drinks, medicine, or chemicals that arrive in batches.",
      "Pick 'Unique / Serialized' for high-value electronics (phones, laptops, cameras) with unique serial numbers.",
    ],
  },
  rotation_rule: {
    title: "Rotation Rule (Which Stock Ships First)",
    badge: "Field • Picking Order",
    simpleMeaning:
      "Tells warehouse pickers which batch of stock should leave the warehouse first when an order comes in.",
    everydayAnalogy:
      "Like rotating stock on a store shelf so old items don't sit at the back forever or expire.",
    exampleScenario: {
      heading: "Quick Guide: FIFO vs FEFO vs LIFO",
      flow: ["Normal Goods → FIFO", "Has Expiry Date → FEFO", "Bulk/Hardware → LIFO"],
      outcome:
        "• FIFO (First-In, First-Out): Ship oldest delivery first.\n• FEFO (First-Expired, First-Out): Ship soonest-expiring batch first.\n• LIFO (Last-In, First-Out): Ship newest delivery first.",
    },
    howToSteps: [
      "Keep 'FIFO (First-In, First-Out)' for standard non-perishable products.",
      "Select 'FEFO (First-Expired, First-Out)' if the product has an expiration date (automatically turns on Expiry Date tracking).",
      "Select 'LIFO' or 'Customer-Specified Lot' only for specialized workflows.",
    ],
  },
  serial_settings: {
    title: "Serialization Settings",
    badge: "Field • Serial Number Rules",
    simpleMeaning:
      "Configures where serial numbers come from (printed by the manufacturer vs generated by you) and when workers must scan them.",
    everydayAnalogy:
      "Phones already have an IMEI printed on the box by Apple/Samsung ('Manufacturer'), whereas custom equipment might need a sticker printed by your warehouse ('System-Generated').",
    exampleScenario: {
      heading: "Example: Scanning Phone IMEIs",
      flow: ["Source: Manufacturer", "Capture: At Inbound Receipt", "Full Traceability"],
      outcome:
        "Workers scan each phone's serial number as soon as it arrives at the warehouse.",
    },
    howToSteps: [
      "Choose 'Manufacturer Serial / IMEI' if the item already has a serial number on its box.",
      "Choose 'At Inbound Receipt' if you want every serial recorded the moment stock enters the warehouse.",
    ],
  },
  expiry_required: {
    title: "Expiry Date & Shelf-Life Rules",
    badge: "Field • Perishable Protection",
    simpleMeaning:
      "When checked, warehouse staff are required to enter an expiration date whenever they receive this product into the warehouse.",
    everydayAnalogy:
      "Acts like a safety gate at your loading dock — prevents anyone from receiving perishable goods without recording when they expire.",
    exampleScenario: {
      heading: "Example: Setting Shelf-Life Guardrails",
      flow: ["Tick 'Expiry Required'", "Total Shelf Life: 365 days", "Min at Receipt: 90 days"],
      outcome:
        "If a supplier tries to deliver stock that expires in only 30 days, the system warns your receiving team.",
    },
    howToSteps: [
      "Tick 'Expiry Date Required at Inbound Receipt' for any food, beverage, medical, or cosmetic item.",
      "Optionally enter 'Total Shelf Life (Days)' (how long the product lasts from manufacture).",
      "Optionally enter 'Min Days Remaining at Receipt' to block suppliers from sending nearly-expired goods.",
    ],
  },
  initial_stock: {
    title: "Record Initial Stock on Hand",
    badge: "Field • Instant Warehouse Deposit",
    simpleMeaning:
      "Lets you create the product SKU AND immediately deposit your current physical quantity onto a warehouse rack in one step.",
    everydayAnalogy:
      "Instead of opening a bank account with $0 and making a separate trip to deposit cash, this opens the account and deposits your starting stock at the same time!",
    exampleScenario: {
      heading: "Example: Adding Product + Current Stock Together",
      flow: ["Tick 'Record Initial Stock'", "Facility: Myaflower", "Rack: MYA-W1-ZA • Qty: 50"],
      outcome:
        "As soon as you click '+ Create Product SKU', 50 units appear live on Rack MYA-W1-ZA in your Inventory Ledger.",
    },
    howToSteps: [
      "Check the box 'Record Initial Stock on Hand'.",
      "Select your Warehouse Facility (e.g. Myaflower) and enter the Opening Quantity.",
      "Pick the Destination Rack / Bin Location where those items are sitting right now.",
      "Click '+ Create Product SKU' — both the catalog item and live inventory balance are created together!",
    ],
  },
  dimensions_weight: {
    title: "Unit Physical Dimensions & Weight",
    badge: "Field • Size & Weight per Unit",
    simpleMeaning:
      "Records the weight (in kg) and Length × Width × Height (in cm) of 1 single unit ('Each') of this product.",
    everydayAnalogy:
      "Helps shipping carriers calculate postage costs and tells the warehouse how much space 100 units will take up on a shelf.",
    exampleScenario: {
      heading: "Example: Measuring a Product Box",
      flow: ["Weight: 1.5 kg", "Length: 30 cm", "Width: 20 cm • Height: 10 cm"],
      outcome:
        "Automatically calculates unit volume and dimensional weight for shipping and storage billing.",
    },
    howToSteps: [
      "Enter the Weight in kilograms (e.g. 0.5 for 500 grams).",
      "Enter Length, Width, and Height in centimeters.",
    ],
  },
  temperature_class: {
    title: "Temperature Class (Storage Climate)",
    badge: "Field • Climate Control",
    simpleMeaning:
      "Specifies whether this product can sit at normal room temperature or requires a refrigerator or freezer.",
    everydayAnalogy:
      "Prevents someone from putting ice cream or chilled vaccines onto a warm warehouse shelf.",
    exampleScenario: {
      heading: "Example: Choosing Storage Climate",
      flow: ["Dry Goods → Ambient", "Dairy/Drinks → Chilled", "Ice/Meat → Frozen"],
      outcome:
        "Displays a temperature badge on the product so staff store it in the correct zone.",
    },
    howToSteps: [
      "Leave on 'Ambient (Standard Room Temp)' for normal dry goods.",
      "Select 'Chilled (2°C to 8°C)' or 'Frozen (-18°C)' for cold-chain products.",
    ],
  },
  hazmat_class: {
    title: "Hazmat / Dangerous Goods Code",
    badge: "Field • Safety Compliance",
    simpleMeaning:
      "Records if the product contains regulated materials like lithium-ion batteries, aerosols, perfumes, or chemicals.",
    everydayAnalogy:
      "Airlines and couriers require a warning sticker (like 'UN3481' for lithium batteries inside laptops/phones) before they transport it.",
    exampleScenario: {
      heading: "Example: Electronics with Batteries",
      flow: ["Product: Laptop / Phone", "Hazmat: UN3481", "Carrier Notified"],
      outcome:
        "Leave blank for normal safe goods; enter the UN code if it contains batteries or flammables.",
    },
    howToSteps: [
      "Leave empty if the product is non-hazardous.",
      "Type the UN or Hazmat classification (e.g. 'UN3481' or 'ORM-D') if applicable.",
    ],
  },
  fragile_item: {
    title: "Fragile Item Flag",
    badge: "Field • Packing Instruction",
    simpleMeaning:
      "Marks this product as breakable (glass, ceramics, screens, liquids) so packing staff know to use extra protection.",
    everydayAnalogy:
      "Puts a digital 'FRAGILE: HANDLE WITH CARE' sticker on the product for your warehouse team.",
    exampleScenario: {
      heading: "Example: Protecting Breakable Goods",
      flow: ["Tick 'Fragile Item'", "Order Packed", "Staff adds Bubble Wrap"],
      outcome:
        "Reduces shipping damage and customer returns.",
    },
    howToSteps: [
      "Check this box if the item can crack, shatter, or leak during shipping.",
    ],
  },
  catalog_status: {
    title: "Catalog Status",
    badge: "Field • Product Lifecycle",
    simpleMeaning:
      "Controls whether this product is currently active for receiving and orders, temporarily paused, or permanently discontinued.",
    everydayAnalogy:
      "Like an On/Off switch for a product without losing its historical records.",
    exampleScenario: {
      heading: "Example: Phasing Out an Old Model",
      flow: ["Active → Normal use", "Inactive → Paused", "Discontinued → Retired"],
      outcome:
        "Setting a product to Inactive or Discontinued keeps its past audit history safe while stopping new receipts.",
    },
    howToSteps: [
      "Keep on 'Active' for products you currently stock and sell.",
      "Switch to 'Inactive' or 'Discontinued' when retiring a product.",
    ],
  },
  barcode_lookup: {
    title: "Instant Barcode Lookup",
    badge: "Quick Tool • Scanner Test",
    simpleMeaning:
      "Scan or type any barcode to immediately verify which Product SKU and packaging level (Each, Case, Pallet) it matches.",
    everydayAnalogy:
      "Like a price-checker kiosk in a store — scan an item to see what the system knows about it.",
    exampleScenario: {
      heading: "Example: Identifying an Unlabeled Box",
      flow: ["Click 'Lookup'", "Scan Barcode", "Shows matching SKU & Details"],
      outcome:
        "Instantly confirms if a barcode is registered in your catalog.",
    },
    howToSteps: [
      "Click 'Lookup' in the toolbar.",
      "Scan or type the barcode number and press Enter.",
    ],
  },
  import_csv: {
    title: "Bulk CSV Import",
    badge: "Quick Tool • Bulk Upload",
    simpleMeaning:
      "Upload a CSV spreadsheet from Excel or Google Sheets to create or update dozens or hundreds of products at once.",
    everydayAnalogy:
      "Instead of typing 200 products one by one, upload a spreadsheet and import them all in 5 seconds.",
    exampleScenario: {
      heading: "Example: Onboarding a New Product Line",
      flow: ["Click 'Import'", "Download Template", "Upload CSV File"],
      outcome:
        "Validates every row and imports all valid products into your catalog.",
    },
    howToSteps: [
      "Click 'Import' to open the importer.",
      "Download the sample CSV template if needed, fill in your products, and upload the file.",
    ],
  },
  export_csv: {
    title: "Export Catalog to CSV",
    badge: "Quick Tool • Spreadsheet Download",
    simpleMeaning:
      "Downloads your currently filtered product catalog as a `.csv` file that opens directly in Microsoft Excel or Google Sheets.",
    everydayAnalogy:
      "One-click backup or report of your entire product list.",
    exampleScenario: {
      heading: "Example: Sharing Product List",
      flow: ["Filter by Brand/Tracking", "Click 'Export'", "Opens in Excel"],
      outcome:
        "Downloads a clean spreadsheet with SKU codes, names, barcodes, tracking rules, and dimensions.",
    },
    howToSteps: [
      "Optionally filter by Brand Client, Tracking, or Rotation first.",
      "Click 'Export' to download the CSV file immediately.",
    ],
  },
};

interface CatalogHelpTooltipProps {
  guideKey: CatalogGuideKey;
  variant?: "default" | "light";
}

export function CatalogHelpTooltip({ guideKey, variant = "default" }: CatalogHelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guide = CATALOG_GUIDES[guideKey];

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
          e.preventDefault();
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
        className={`inline-flex items-center justify-center rounded-full p-0.5 transition-all cursor-help select-none align-middle ${
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
            className="z-[10000] rounded-2xl border border-border bg-surface text-foreground shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
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

                <p className="text-[11px] text-muted-foreground leading-snug whitespace-pre-line">
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

