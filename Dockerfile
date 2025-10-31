# Use Playwright's Docker image with Chromium
FROM mcr.microsoft.com/playwright:focal

# Set working directory
WORKDIR /app

# Copy package.json and yarn.lock
COPY package.json yarn.lock ./

# Install dependencies (including Playwright)
RUN yarn install --frozen-lockfile

# Copy the rest of the code
COPY . .

# Build the extension
RUN yarn build:chromium

# Expose a port if needed for serving demo pages (optional)
EXPOSE 3000

# Default command (can be overridden)
CMD ["echo", "Extension built and ready for testing"]
