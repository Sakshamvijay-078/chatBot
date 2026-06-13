import os
import fitz  # PyMuPDF
import faiss
import numpy as np
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter

MODEL_CACHE_DIR = "./model_cache"
os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

# 1. Initialize the embedding model (runs locally, free, and fast)
encoder = SentenceTransformer("all-MiniLM-L6-v2")
VECTOR_DIM = 384 # The specific dimension size for all-MiniLM-L6-v2

# Ensure the root vector storage directories exist
os.makedirs("vector_stores/global", exist_ok=True)

def extract_text_from_pdf(file_bytes):
    """Extracts plain text from a PDF file using PyMuPDF."""
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    return text

def chunk_text(text):
    """Splits text into 1000-character chunks with a 200-character overlap."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1000,
        chunk_overlap=200
    )
    return splitter.split_text(text)

def save_to_faiss(chunks, index_path):
    """Embeds chunks and saves the FAISS index + raw text to disk."""
    if not chunks:
        return
        
    # Convert text to vector embeddings
    embeddings = encoder.encode(chunks)
    
    # Initialize and populate the FAISS index
    index = faiss.IndexFlatL2(VECTOR_DIM)
    index.add(np.array(embeddings).astype("float32"))
    
    # Save the FAISS index to the folder
    faiss.write_index(index, f"{index_path}/index.faiss")
    
    # Save the actual text chunks so we can read them later
    with open(f"{index_path}/chunks.txt", "w", encoding="utf-8") as f:
        for chunk in chunks:
            # Replace newlines with a special token to keep one chunk per line
            f.write(chunk.replace("\n", "\\n") + "\n")

def process_pdf(file_bytes, thread_id, is_global=False):
    """The Write Pipeline: Takes PDF bytes and routes them to global or local storage."""
    text = extract_text_from_pdf(file_bytes)
    chunks = chunk_text(text)
    
    if is_global:
        index_path = "vector_stores/global"
    else:
        index_path = f"vector_stores/{thread_id}"
        os.makedirs(index_path, exist_ok=True)
        
    save_to_faiss(chunks, index_path)

def retrieve_from_index(query_embedding, index_path, top_k=2):
    """Helper function to search a specific FAISS folder."""
    if not os.path.exists(f"{index_path}/index.faiss"):
        return []
        
    # Load index and text chunks
    index = faiss.read_index(f"{index_path}/index.faiss")
    with open(f"{index_path}/chunks.txt", "r", encoding="utf-8") as f:
        all_chunks = [line.strip().replace("\\n", "\n") for line in f]
        
    # Search FAISS
    distances, indices = index.search(np.array([query_embedding]).astype("float32"), top_k)
    
    # Map vector indices back to actual text
    results = []
    for idx in indices[0]:
        if idx != -1 and idx < len(all_chunks):
            results.append(all_chunks[idx])
    return results

def query_documents(prompt, thread_id):
    """The Read Pipeline: Queries both global and chat-specific vector stores."""
    # Embed the user's question
    query_embedding = encoder.encode([prompt])[0]
    
    context_chunks = []
    
    # 1. Search Chat-Specific Sandbox
    local_path = f"vector_stores/{thread_id}"
    context_chunks.extend(retrieve_from_index(query_embedding, local_path, top_k=2))
    
    # 2. Search Global Library
    global_path = "vector_stores/global"
    context_chunks.extend(retrieve_from_index(query_embedding, global_path, top_k=2))
    
    return context_chunks