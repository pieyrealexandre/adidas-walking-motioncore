FROM node:18

RUN apt-get update && apt-get install -y unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

# Pre-bake the SCRFD face detector model from insightface's v0.7 release.
# buffalo_l.zip is ~288 MB but we only need det_10g.onnx (~17 MB), so we
# extract just that file and delete the zip to keep the image lean.
RUN mkdir -p /app/models \
  && curl -fsSL -o /tmp/buffalo_l.zip https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip \
  && unzip -j /tmp/buffalo_l.zip "*det_10g.onnx" -d /app/models \
  && rm /tmp/buffalo_l.zip \
  && ls -lh /app/models/det_10g.onnx

COPY . .

EXPOSE 8080

CMD ["npm", "start"]
