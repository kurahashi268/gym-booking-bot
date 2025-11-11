# Ritmos Booking Bot (Playwright TypeScript Version)

This is a TypeScript/Playwright version of the Python Selenium booking bot for Ritmos fitness lessons.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install chromium
```

## Configuration

Edit the parameters in `src/index.ts`:

- `LOGIN_ID`: Your login ID
- `PASSWORD`: Your password
- `reservation_time`: The reservation time (format: "YYYY-MM-DD HH:MM:SS")
- `flying_time`: Early trigger time in seconds (default: 0.65)
- `selected_store_index`: Store index (see comments in code)
- `lesson_date`: CSS selector for the lesson date
- `lesson_no`: CSS selector for the lesson location/seat
- `confirm_reservation`: Set to `true` to actually make the reservation, `false` for testing

## Usage

### Development (with ts-node):
```bash
npm run dev
```

### Production (compile first):
```bash
npm run build
npm start
```

## Features

- Waits until a specific time before starting the booking process
- Automatically logs in to the booking system
- Selects store, lesson date, and seat
- Retry logic for handling page load issues
- Checks background color to determine if lesson is available
- Timestamp logging for monitoring performance

## Notes

- The bot will wait until 2 minutes before the reservation time to launch the browser
- Then waits until 1 second before the actual reservation time
- Adds a small "flying time" offset before clicking to account for network latency
- Uses Tokyo timezone for all time calculations
