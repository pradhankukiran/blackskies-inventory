# BlackSkies Inventory

A demand planning tool for inventory management and stock recommendations, built with React, TypeScript, and Tailwind CSS.

## Overview

The application processes these files to provide:
- Integrated stock overview
- Stock recommendations based on historical data
- Timeline-based demand planning

## Features

- **File Upload Interface**: Upload and manage multiple inventory files
- **Stock Overview**: Consolidated view of stock across multiple channels
- **Demand Planning**: Get recommendations based on sales history and current stock levels
- **Timeline Analysis**: Analyze data over different time periods (30 days or 6 months)
- **User-Friendly Interface**: Clean UI built with Tailwind CSS and Radix UI components

## Technology Stack

- **Frontend**: React, TypeScript
- **Styling**: Tailwind CSS
- **File Processing**: XLSX, PapaParse
- **Build Tools**: Vite, PostCSS
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/yourusername/blackskies-inventory.git
cd blackskies-inventory
```

2. Install dependencies
```bash
npm install
# or
yarn
```

3. Start the development server
```bash
npm run dev
# or
yarn dev
```

4. Open your browser and navigate to `http://localhost:5173`

## Usage

1. Upload your inventory files using the file upload interface
2. Select the appropriate timeline for analysis
3. Click "Process Files" to generate the integrated stock overview and recommendations
4. View and analyze the results in the tabbed interface

## Building for Production

```bash
npm run build
# or
yarn build
```

The built files will be in the `dist` directory, ready to be deployed.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 