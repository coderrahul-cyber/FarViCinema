# FarViCin - (A digital Cinam for people who live far away from each other)🙌







Table of Contents :
- [How to Start](#how-to-start)  
  



## How to Start
1. Clone the repository and navigate to the project directory.
2. Install dependencies using `bun install` at the root of the monorepo.
3. Set up your environment variables in the `.env` file at the root of the mon
4. Setup the docker 
   - In docker/compose
      Run (For initializing the mediasoup server and postgres database):
      ```bash
        docker compose -f ./docker-compose.dev.yml up -d
        ```
       Run (For the Redis server):
        ```bash
        docker compose -f ./docker-compose.redis.yml up -d
        ```
       Run (For the coturn server and nginx server):
        ```bash
        docker compose -f ./docker-compose.servers.yml up -d
        ```
5. Run the development servers:
    - For the wsbackend server (In apps/wsbackend):
        ```bash
            bun run wsbackend
        ```
    - For the frontend server (In apps/web):
        ```bash
            bun run web
        ```
    - For RoomRouter server (In apps/roomrouter):
        ```bash
            bun run roomrouter
        ```
    - For mediasoup server (In Conatiner):
         ```bash
            docker exec -it <mediasoup_container_name> bash
         ```
         Then inside the container run:
         ```bash
            cd /usr/src
         ```
         Then run:
         ```bash
            npm start
         ```
6. Access the application in your browser at `http://localhost` (or the port you have configured in Nginx).