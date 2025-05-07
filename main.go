package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"github.com/gorilla/websocket"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			// Since the Go server is serving the frontend, origin will be the same.
			// Allowing all origins is okay here, but you could check against the expected host.
			return true
		},
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	clients = make(map[*websocket.Conn]bool)
	mutex   = &sync.Mutex{}

	latestReplicaCount int32 = 1

	// Configuration for the target deployment - loaded from environment variables
	targetDeploymentName      = os.Getenv("TARGET_DEPLOYMENT_NAME")
	targetDeploymentNamespace = os.Getenv("TARGET_DEPLOYMENT_NAMESPACE")

	// Directory where the static Next.js files are located within the container/local filesystem
	staticFilesDir = os.Getenv("STATIC_FILES_DIR") // e.g., "/app/out"
)

func main() {
	fmt.Println("Hello Next")
	// if targetDeploymentName == "" || targetDeploymentNamespace == "" {
	// 	log.Fatal("TARGET_DEPLOYMENT_NAME and TARGET_DEPLOYMENT_NAMESPACE environment variables must be set")
	// }
	if staticFilesDir == "" {
		// log.Fatal("STATIC_FILES_DIR environment variable must be set to the path of Next.js static files")
		staticFilesDir = "client/out"
	}
	log.Printf("Targeting deployment %s/%s for scaling and monitoring", targetDeploymentNamespace, targetDeploymentName)
	log.Printf("Serving static files from directory: %s", staticFilesDir)

	// --- Serve Static Files ---
	// Create a file server handler that serves files from the specified directory.
	// http.Dir ensures the path is treated as a directory.
	fileServer := http.FileServer(http.Dir(staticFilesDir))

	// Handle all other requests by serving static files.
	// This handler will check if the requested path exists as a file in staticFilesDir.
	// If it does, it serves the file. If not, it might serve index.html for SPAs,
	// or return a 404. For Next.js static export, it handles routing based on file structure.
	http.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Important for SPAs or Next.js static exports: if a path like /game
		// doesn't map directly to a file, you often want to serve index.html
		// and let the client-side router handle it. Next.js static export
		// handles this somewhat automatically if you navigate to /game and it
		// exists as out/game/index.html. For / (root), it serves out/index.html.
		// The http.FileServer handles index.html automatically for directories.

		// Prevent directory listing
		if _, err := os.Stat(filepath.Join(staticFilesDir, r.URL.Path)); os.IsNotExist(err) && r.URL.Path != "/" {
			// If the requested path doesn't exist as a file/directory,
			// and it's not the root, check if index.html exists for that path
			// (e.g., request for /about serves /out/about/index.html)
			indexPath := filepath.Join(staticFilesDir, r.URL.Path, "index.html")
			if _, err := os.Stat(indexPath); !os.IsNotExist(err) {
				// Serve the index.html for the sub-path
				http.ServeFile(w, r, indexPath)
				return
			}
			// If index.html for the sub-path doesn't exist, check if root index.html exists
			indexPath = filepath.Join(staticFilesDir, "index.html")
			if _, err := os.Stat(indexPath); !os.IsNotExist(err) {
				// Serve the root index.html for any unmatched path (common for SPAs)
				http.ServeFile(w, r, indexPath)
				return
			}
		}

		// Serve the file using the standard file server
		fileServer.ServeHTTP(w, r)
	}))

	// --- Start HTTP Server ---
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port
	}
	listenAddr := fmt.Sprintf(":%s", port)
	log.Printf("Starting HTTP and WebSocket server on %s", listenAddr)
	err := http.ListenAndServe(listenAddr, nil)
	if err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}
