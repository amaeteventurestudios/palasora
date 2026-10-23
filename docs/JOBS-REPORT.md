# Bigger businesses: hiring and job boards

Agents have always looked for work every working hour. They take the best-paid open position above the civic wage, or the Town Hall's civic job. People now get the same choice themselves, on a job board, and owners can post jobs at a wage they set.

## Rules (`economy/town/jobs.py`, `actions.py`)

- **The board:** `jobs.publish` runs every hour after the agents act. It writes each open business's open positions to `job_openings`:
  - open positions are the places the owner asked for, up to the room left in the team at the business's level;
  - the day's wage is included;
  - filled, closed or withdrawn openings are removed.

  The board reads only this table and `jobs`.
- **Applying** (`apply_job`, sent through `POST /town/me/requests`):
  - Before the request queues, the service checks that the business is open and hiring, and that it isn't the person's own business or current job.
  - The next hour applies it through the Actions gate. Owners' requests run before the agents decide, so a person who asks first is hired first.
  - If the place was filled in the meantime, the request comes back refused with `NOT_HIRING`.
  - The civic job (`employer: civic`) is always open.
  - Job requests are stored without a business, so they never appear on the employer's card.
- **Leaving** (`quit_job`): an owner goes back to working in their own business. Anyone else's agent looks for work again at the next working hour: it takes the civic job, or a better-paid opening.
- **Posting a job** (`post_job`, an owner request on the business card or the job board):
  - The owner sets how many to take on (1 to 5, within the room left in the team) and the day's wage.
  - The wage must be at least half the civic wage, and it applies to the whole team, as it always has.
  - The post appears in the town feed as "Hiring".
- **Stopping** (`stop_hiring`): this withdraws the open places.
- **Pay:** wages are still paid every evening at 20:00, and every payment is in the ledger.

## People

- **Job board** (main menu, or "See the job board" on the Town Hall's card). It shows:
  - a summary line: open positions, how many people work in businesses, and the average wage;
  - every open position, highest wage first, with the business, its owner and plot, how many places are open and how full the team is. Wages at or below the civic wage are flagged;
  - the civic job;
  - who was hired lately.
- **Your job:** a resident sees their job and wage. They can apply anywhere with one tap, leave their job, and follow each request as it waits, is done, or is refused and why. An owner is told that taking a job elsewhere means their business runs without them.
- **Your team:** each business an owner runs shows its staff and wage, and has "Post a job" (places and wage) and "Stop hiring".

## API

- `GET /town/jobs?user_id=` returns:
  - the openings, the civic job, recent hires and the summary figures;
  - for a resident, their job and requests;
  - for an owner, their teams.

## Tests

- **Service:** `tests/test_jobs.py` covers:
  - the board matching the world;
  - an owner posting a job, a resident taking it before the agents look, and the resident's wage arriving at 20:00;
  - the request checks;
  - leaving a job, and taking the civic one;
  - stopping hiring, the minimum wage, and a quitting owner going back to their own business.

  The conservation checks run every hour throughout.
- **Browser:** `tests/e2e/world-jobs.spec.ts` (J-01 to J-03). The test town (`e2e_fixtures._seed_jobs`) has:
  - the factory b009 hiring 2 at 22.00 Sora a day;
  - workshop b003 hiring 1 at 16.00 Sora a day;
  - two civic workers.

  The residents directory test (R-01) now counts 2 residents without a job, down from 5.
