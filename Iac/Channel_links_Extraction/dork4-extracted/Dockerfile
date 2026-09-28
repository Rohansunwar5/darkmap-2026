
FROM python:3.10-slim


ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1


RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libfontconfig1 \
    libxrender1 \
    wget \
    unzip \
    curl \
    gnupg \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*


RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*


ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app


COPY . /app


RUN pip install --no-cache-dir --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt


EXPOSE 5000

# Define the command to run the application
CMD ["sh", "-c", "hypercorn channels:app --bind 0.0.0.0:${PORT:-5000}"]
