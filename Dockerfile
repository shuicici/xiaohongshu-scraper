FROM apify/actor-node:18

# Install dependencies
COPY package.json package-lock.json ./
RUN npm install --include=dev

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Run the Actor
CMD ["npm", "start"]