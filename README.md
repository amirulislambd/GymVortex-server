# 🏋️ GymVortex - Fitness & Gym Management Platform

GymVortex is a modern fitness and gym management platform built for fitness enthusiasts, trainers, and administrators. Users can discover fitness classes, book sessions, save favorite classes, participate in community discussions, and track their fitness journey.

> ⚠️ Project Status: Currently under active development.

---

## 🌐 Live Site

Client: https://gymvortex.vercel.app

Server: https://gymvortex-server.vercel.app

---

## 🎯 Project Purpose

The purpose of GymVortex is to provide a complete fitness ecosystem where:

- Users can explore and book fitness classes.
- Trainers can create and manage classes.
- Admins can manage users, trainers, classes, and transactions.
- Community members can interact through forum discussions.

---

## ✨ Key Features

### 👤 User Features

- User Registration & Login
- Google Authentication
- Browse Fitness Classes
- Search Classes by Name
- Filter Classes by Category
- Book Fitness Classes
- Save Favorite Classes
- Apply to Become a Trainer
- Community Forum Participation
- View Personal Dashboard Statistics

### 🏋️ Trainer Features

- Trainer Dashboard
- Add New Classes
- Update & Delete Classes
- View Class Attendees
- Create Forum Posts
- Manage Personal Forum Posts
- View Enrollment Statistics

### 🛡️ Admin Features

- User Management
- Block / Unblock Users
- Promote Users to Admin
- Approve / Reject Trainer Applications
- Manage Trainers
- Approve / Reject Classes
- View Platform Transactions
- Moderate Community Forum

### 💬 Community Features

- Create Forum Posts
- Like / Dislike Posts
- Add Comments
- Reply to Comments
- Edit Own Comments
- Delete Own Comments

### 📊 Dashboard Features

- User Statistics
- Trainer Statistics
- Admin Statistics
- Activity Tracking
- Streak & Rank System

---

## 🛠️ Technologies Used

### Frontend

- Next.js
- React.js
- Tailwind CSS
- HeroUI
- React Query (TanStack Query)
- React Hook Form
- Axios
- Framer Motion
- React Hot Toast

### Backend

- Node.js
- Express.js
- MongoDB
- JWT Authentication
- Better Auth
- Cookie Parser

### Database

- MongoDB Atlas

### Payment Gateway

- Stripe

### Image Hosting

- ImgBB

---

## 📂 Project Structure

### Server

```bash
gymvortex-server/
│
├── .env
├── index.js
├── package.json
└── vercel.json
```

### Client

```bash
gymvortex-client/
│
├── src/
├── public/
├── components/
├── app/
├── hooks/
├── services/
└── package.json
```

---

## 🔐 Environment Variables

### Server

```env
PORT=5000

MONGO_DB_URI=your_mongodb_uri

JWT_SECRET=your_jwt_secret

STRIPE_SECRET_KEY=your_stripe_secret_key
```

### Client

```env
NEXT_PUBLIC_API_URL=your_server_url

NEXT_PUBLIC_IMGBB_API_KEY=your_imgbb_key

NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_key
```

---

## 🚀 Installation & Setup

### Clone Repository

```bash
git clone https://github.com/amirulislambd/GymVortex.git

git clone https://github.com/amirulislambd/GymVortex-server.git
```

### Install Dependencies

Client:

```bash
npm install
```

Server:

```bash
npm install
```

### Run Development Server

Backend:

```bash
npm run dev
```

Frontend:

```bash
npm run dev
```

---

## 📦 Major NPM Packages

### Frontend

- next
- react
- tailwindcss
- @tanstack/react-query
- react-hook-form
- axios
- framer-motion
- react-hot-toast
- hero-ui

### Backend

- express
- mongodb
- cors
- dotenv
- jsonwebtoken
- cookie-parser
- stripe
- better-auth

---

## 🔮 Upcoming Features

- Dark / Light Theme Toggle
- Advanced Analytics Dashboard
- Push Notifications
- Trainer Performance Reports
- Membership Subscription System

---

## 👨‍💻 Developer

Developed by **Amirul Islam**

---

## 📜 License

This project is created for educational and portfolio purposes.