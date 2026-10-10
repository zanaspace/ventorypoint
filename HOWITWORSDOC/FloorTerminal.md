
VentoryPoint has two kinds of user, and they work very differently:

┌────────────┬─────────────────────────────────────┬───────────────────────────────────┐
│            │ Office users (owners, admins, ops   │ Floor workers (pickers, packers,  │
│            │   managers, supervisors, billing)   │   receivers, forklift drivers)    │
├────────────┼─────────────────────────────────────┼───────────────────────────────────┤
│ Where they │ Desk, laptop                        │ On their feet in the warehouse,   │
│  work      │                                     │ often wearing gloves              │
├────────────┼─────────────────────────────────────┼───────────────────────────────────┤
│ How they   │ Email + password, Google or         │ Scan a badge + type a 4–6 digit   │
│ sign in    │ Microsoft                           │ PIN                               │
├────────────┼─────────────────────────────────────┼───────────────────────────────────┤
│ Device     │ Their own computer                  │ Shared tablets, scanners and      │
│            │                                     │ pick-cart screens                 │
├────────────┼─────────────────────────────────────┼───────────────────────────────────┤
│ Screen     │ The dashboard you've been using     │ Floor Terminal: dark, big text    │
│            │                                     │ and buttons, one task at a time   │
└────────────┴─────────────────────────────────────┴───────────────────────────────────┘

The Floor Terminal (/floor-login) is the floor workers' way into the system. Many floor workers don't have a company email, terminals are shared across shifts, and typing a password with gloves on is slow. So the terminal uses badge + PIN, signs in within seconds, and keeps the worker signed in for a 12-hour shift.

How it works today

1. A manager creates the worker's badge in Members (floor worker → badge + PIN). You can print the badge as a card with a barcode.
2. The worker opens the Floor Terminal on a shared tablet or computer and scans the badge (barcode scanner or camera), or types the badge code.
3. They type their PIN on the large on-screen keypad.
4. The shift starts. The screen shows their name, worker code, organization, terminal and warehouse.
   - First time on this terminal: the terminal registers itself. If the worker has several warehouses, it asks "Which warehouse is this terminal in?" once.
5. End Shift signs them out. Otherwise the session ends automatically after 12 hours.

Security:
- Five wrong PINs lock the badge for 15 minutes.
- Every scan is recorded against both the worker (badge) and the terminal.
- Supervisors can block a lost tablet, which signs everyone out of it instantly.

What it doesn't do yet

Right now the terminal is only the sign-in station. After signing in, "Open Floor Picking Workspace" just shows a placeholder, because the actual floor work arrives in later sprints of Phase 1:

┌────────────────┬──────────────────────────────────────────────────────────────────────┐
│     Sprint     │                 What workers will do on the terminal                 │
├────────────────┼──────────────────────────────────────────────────────────────────────┤
│ 6, Floor       │ The task screen itself: one task per screen, scan-first, green /     │
│ Workspace      │ amber / red feedback, works offline and syncs when the connection is │
│                │  back                                                                │
├────────────────┼──────────────────────────────────────────────────────────────────────┤
│ 7, Receiving & │ Scan incoming cartons, count them, put stock away into bins          │
│  Putaway       │                                                                      │
├────────────────┼──────────────────────────────────────────────────────────────────────┤
│ 9, Waves &     │ "Go to A04-12-C-02, pick 6 of SKU-TEE-BLK-M", scan to confirm        │
│ Picking        │                                                                      │
├────────────────┼──────────────────────────────────────────────────────────────────────┤
│ 10, Pack &     │ Scan items into cartons, weigh, print labels                         │
│ Ship           │                                                                      │
├────────────────┼──────────────────────────────────────────────────────────────────────┤
│ 11, Cycle      │ Count a bin, scan to submit                                          │
│ Counting       │                                                                      │
└────────────────┴──────────────────────────────────────────────────────────────────────┘

Each of those scans becomes a permanent warehouse event in the event store we built in Sprint 2. That's why the terminal, the devices and the floor sessions came first.

Try it yourself

1. Members → add a floor worker → note the badge code and PIN.
2. Sign out (or open a private window) → Floor Terminal (on the login page, or /floor-login).
3. Type the badge code, press Enter, enter the PIN → you'll see the shift screen.

The terminal also still uses the older dark styling rather than the design system's floor-mode kit (big feedback states, 20px minimum text, 56px buttons). That restyle belongs with Sprint 6, when the real task screens are built.