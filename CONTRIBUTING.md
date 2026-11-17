# Contributing to AEGIS

Thanks for taking a look. This project exists to help people pass certification
exams without paying for study tools, so help of any size is welcome.

## Layout
- `apps/web` is the study app and the network lab. Most contributions go here.
- `services` is the operator platform back end.
- `contracts` holds the OpenAPI and event schemas the two sides share.

## Getting set up
You need Node 20 or newer.

    cd apps/web
    npm install
    cp .env.example .env.local
    npm run dev

Open http://localhost:3000. The app runs against built in mock data, so you do not
have to run the back end.

## Good places to start
Look for issues labelled `good first issue`. If none are open, these are always useful:
- Writing flashcards or exam questions for a topic that is thin
- Fixing wording in a lesson that is confusing or wrong
- Reporting anything in the lab that behaves differently from real Cisco gear
- Making a page work better on a phone

You do not have to be a programmer. Corrections to the study content are just as
valuable as code.

## Before you open a pull request
    cd apps/web
    npm run typecheck
    npm test
    npx playwright test

All three should pass.

## House rules for content
- Write your own explanations. Do not copy from Cisco material, from a paid course,
  or from exam dumps. Anything copied from a real exam will be rejected.
- Keep explanations plain. Explain the idea first, then the vendor terms.
- If a lab claims real hardware behaviour, say which behaviour and where you checked it.

## Code style
- TypeScript, no `any` unless there is no way around it.
- Comments explain why, not what. Keep them short.
- Every source file carries the SPDX licence header. Copy it from a neighbouring file.

## Licence
AEGIS is licensed under the GNU Affero General Public License v3.0. By opening a pull
request you agree your contribution is licensed the same way, and that you wrote it
or have the right to submit it.

## Reporting a security problem
Do not open a public issue. Email kamarajosephallan@gmail.com instead.
