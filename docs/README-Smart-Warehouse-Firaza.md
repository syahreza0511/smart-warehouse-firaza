# Smart Warehouse Firaza

![Project Status](https://img.shields.io/badge/status-development-blue)

Smart Warehouse Firaza is a Full Stack Web Application designed to help
retail hampers and personalized gift businesses manage raw material
inventory digitally.

This project is developed as an individual capstone project with a focus
on implementing modern Full Stack Development practices using React.js,
Express.js, PostgreSQL, and Prisma ORM.

------------------------------------------------------------------------

# Project Overview

Warehouse operations require accurate inventory information to ensure
material availability and operational efficiency.

Smart Warehouse Firaza provides a centralized system for:

-   Managing raw material data.
-   Recording stock in transactions.
-   Recording stock out transactions.
-   Performing stock opname.
-   Monitoring inventory conditions.
-   Generating inventory reports.

The system focuses on Raw Material Inventory Management and uses
synthetic business data because operational data from the business
partner is not publicly available.

------------------------------------------------------------------------

# Problem Statement

Manual inventory management can create several operational challenges:

-   Difficulty monitoring current stock conditions.
-   Limited visibility of inventory changes.
-   Risk of inaccurate stock records.
-   Difficulty tracking transaction history.

Smart Warehouse Firaza aims to provide a structured digital solution for
inventory monitoring and management.

------------------------------------------------------------------------

# Features

## Authentication

-   Login and logout.
-   JWT Authentication.
-   Role Based Access Control.

User roles:

### Owner

Access:

-   View dashboard.
-   Monitor inventory.
-   View reports.
-   View transaction history.

### Staff Warehouse/Admin

Access:

-   Manage materials.
-   Create stock in transactions.
-   Create stock out transactions.
-   Perform stock opname.

------------------------------------------------------------------------

## Material Management

Manage raw material inventory:

-   Create material.
-   Update material.
-   View material details.
-   Search material.
-   Filter material.

Example materials:

-   Kardus.
-   Ribbon.
-   Bubble wrap.
-   Packaging materials.
-   Supporting materials.

------------------------------------------------------------------------

## Inventory Transaction

### Stock In

Records incoming materials.

Process:

    Material arrives
            |
    Staff creates stock in
            |
    Inventory increases

### Stock Out

Records outgoing materials.

Process:

    Material used
            |
    Staff creates stock out
            |
    Inventory decreases

------------------------------------------------------------------------

## Stock Opname

Allows warehouse staff to compare:

-   System stock.
-   Physical stock.

Calculation:

    Adjustment =
    Actual Stock - System Stock

------------------------------------------------------------------------

## Dashboard

Provides inventory overview:

-   Total materials.
-   Stock condition.
-   Low stock materials.
-   Recent transactions.

------------------------------------------------------------------------

## Reporting

Available reports:

-   Inventory report.
-   Transaction report.

------------------------------------------------------------------------

# Technology Stack

## Frontend

-   React.js
-   Vite
-   Tailwind CSS

## Backend

-   Express.js

## Database

-   PostgreSQL

## ORM

-   Prisma ORM

## Communication

-   REST API
-   Axios

## Authentication

-   JWT Authentication

## Version Control

-   Git
-   GitHub

------------------------------------------------------------------------

# System Architecture

    React.js Frontend

            |

           Axios

            |

    Express.js REST API

            |

    Prisma ORM

            |

    PostgreSQL Database

------------------------------------------------------------------------

# Database Entity

Main entities:

    Users

    Categories

    Materials

    Inventory Transactions

    Stock Opname

Relationship overview:

    Users
     |
     |---- Transactions
     |
     |---- Stock Opname


    Categories
     |
     |---- Materials
              |
              |---- Transactions
              |
              |---- Stock Opname

------------------------------------------------------------------------

# Project Structure

    smart-warehouse-firaza/

    ├── frontend/
    │
    ├── backend/
    │
    ├── docs/
    │
    └── README.md

Documentation:

    docs/

    ├── PRD.md
    ├── DATABASE-DESIGN.md
    ├── API-DOCUMENTATION.md
    ├── USER-FLOW.md
    ├── DEVELOPMENT-TASK.md
    ├── PROJECT-CONTEXT.md
    ├── CODING-GUIDELINE.md
    └── FEATURE-SPECIFICATION.md

------------------------------------------------------------------------

# Development Approach

This project follows a structured development workflow:

1.  Product planning.
2.  Database design.
3.  API design.
4.  User flow design.
5.  Feature specification.
6.  Backend development.
7.  Frontend development.
8.  Testing.
9.  Deployment.

------------------------------------------------------------------------

# Local Development Setup

## Prerequisites

Required:

-   Node.js
-   PostgreSQL
-   Git

------------------------------------------------------------------------

## Clone Repository

``` bash
git clone <repository-url>

cd smart-warehouse-firaza
```

------------------------------------------------------------------------

# Backend Setup

Go to backend directory:

``` bash
cd backend
```

Install dependencies:

``` bash
npm install
```

Create environment file:

    .env

Example:

``` env
DATABASE_URL="postgresql://username:password@localhost:5432/smartwarehouse"

JWT_SECRET="your_secret_key"
```

Run Prisma migration:

``` bash
npx prisma migrate dev
```

Run backend:

``` bash
npm run dev
```

------------------------------------------------------------------------

# Frontend Setup

Go to frontend directory:

``` bash
cd frontend
```

Install dependencies:

``` bash
npm install
```

Run application:

``` bash
npm run dev
```

------------------------------------------------------------------------

# API Documentation

API documentation is available in:

    docs/API-DOCUMENTATION.md

Base API:

    /api/v1

------------------------------------------------------------------------

# Development Rules

This project follows these principles:

-   Build only MVP scope.
-   Avoid unnecessary complexity.
-   Maintain clean code.
-   Follow existing documentation.
-   Review architectural changes before implementation.

------------------------------------------------------------------------

# Future Development

Potential future improvements:

-   Supplier management.
-   Finished product inventory.
-   AI inventory recommendation.
-   Demand forecasting.
-   Marketplace integration.

These features are outside the current MVP scope.

------------------------------------------------------------------------

# Project Goal

The final goal of Smart Warehouse Firaza is to deliver a professional
Full Stack portfolio project demonstrating:

-   Frontend development.
-   Backend API development.
-   Database design.
-   Authentication implementation.
-   Inventory management logic.
-   Professional software documentation.

------------------------------------------------------------------------

# Author

Muhammad Syah Reza Setyawan

Full Stack Web Developer Capstone Project
