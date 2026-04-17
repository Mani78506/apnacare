# ApnaCare 🚀

ApnaCare is a real-time caregiver booking platform.

## Features

- Book caregivers for elderly/patient care
- Live pricing (hourly/daily/monthly)
- Secure OTP verification
- QR-based identity system
- Real-time tracking
- Caregiver dashboard
- Document verification
- Razorpay payment integration

## Tech Stack

- Backend: FastAPI
- Frontend: React (Vite + TS)
- Database: PostgreSQL
- Payment: Razorpay

## Setup

### Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

### Frontend
cd frontend
npm install
npm run dev
