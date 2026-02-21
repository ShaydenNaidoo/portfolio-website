FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
COPY . .
RUN go build -o server .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /app/server ./server
COPY --from=build /app/data ./data
EXPOSE 8080
CMD ["./server"]
