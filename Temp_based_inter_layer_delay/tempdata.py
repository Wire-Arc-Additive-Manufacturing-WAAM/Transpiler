import asyncio
import websockets
import csv
import json

async def save_websocket_data():
    uri = "ws://localhost:9900" # Change if host is not local
    csv_file = 'output.csv'
    
    print(f"Connecting to {uri}...")
    
    async with websockets.connect(uri) as websocket:
        print("Connected.")
        
        # Open CSV file to append data
        with open(csv_file, mode='a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            
            # Write header if file is empty (optional)
            # writer.writerow(["timestamp", "value"]) 
            
            while True:
                try:
                    # Receive data from websocket
                    data = await websocket.recv()
                    
                    # Assuming data is JSON, parse it. If raw string, skip json.loads
                    # parsed_data = json.loads(data)
                    # print(f"Received: {parsed_data}")
                    # writer.writerow([parsed_data['time'], parsed_data['value']])
                    
                    # For raw text data:
                    print(f"Received: {data}")
                    writer.writerow([data]) 
                    
                    # Optional: Flush frequently to ensure data saves
                    f.flush()
                    
                except Exception as e:
                    print(f"Error: {e}")
                    break

# Run the script
if __name__ == "__main__":
    asyncio.run(save_websocket_data())
