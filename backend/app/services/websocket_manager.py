from collections import defaultdict

from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections = defaultdict(list)

    async def connect(self, booking_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[booking_id].append(websocket)

    def disconnect(self, booking_id: int, websocket: WebSocket):
        connections = self.active_connections.get(booking_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections and booking_id in self.active_connections:
            self.active_connections.pop(booking_id, None)

    async def broadcast(self, booking_id: int, data: dict):
        stale_connections = []
        for websocket in list(self.active_connections.get(booking_id, [])):
            try:
                await websocket.send_json(data)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            self.disconnect(booking_id, websocket)

manager = ConnectionManager()
