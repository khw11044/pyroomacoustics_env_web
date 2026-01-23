from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil

from simulation import run_simulation

app = FastAPI(title="Room Acoustic Simulation API")

# CORS 설정 (프론트엔드에서 접근 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 개발 중에는 모든 origin 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 디렉토리 설정
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 업로드된 파일 추적
uploaded_files = {}  # {filename: filepath}


# --- Pydantic 모델 ---

class Point(BaseModel):
    x: float
    y: float


class NormalizedPoint(BaseModel):
    nx: float
    ny: float


class AudioSourceData(BaseModel):
    name: str
    position: Optional[Point] = None


class SimulationRequest(BaseModel):
    room_coords: List[Point]
    robot_position: Point
    robot_radius: float
    microphones: List[NormalizedPoint]
    audio_sources: List[AudioSourceData]
    scale: float = 100.0  # 100px = 1m


class SimulationResponse(BaseModel):
    success: bool
    message: str
    output_files: List[str] = []


# --- API 엔드포인트 ---

@app.get("/")
def root():
    return {"message": "Room Acoustic Simulation API", "status": "running"}


@app.post("/upload-audio")
async def upload_audio(files: List[UploadFile] = File(...)):
    """
    WAV 파일 업로드
    """
    uploaded = []
    for file in files:
        if not file.filename.endswith('.wav'):
            continue

        # 파일 저장
        filepath = os.path.join(UPLOAD_DIR, file.filename)
        with open(filepath, "wb") as f:
            shutil.copyfileobj(file.file, f)

        uploaded_files[file.filename] = filepath
        uploaded.append(file.filename)

    return {"uploaded": uploaded, "total": len(uploaded)}


@app.post("/simulate", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    """
    음향 시뮬레이션 실행
    """
    # 요청 데이터를 딕셔너리로 변환
    room_coords = [{"x": p.x, "y": p.y} for p in request.room_coords]
    robot_position = {"x": request.robot_position.x, "y": request.robot_position.y}
    microphones = [{"nx": m.nx, "ny": m.ny} for m in request.microphones]
    audio_sources = [
        {"name": a.name, "position": {"x": a.position.x, "y": a.position.y} if a.position else None}
        for a in request.audio_sources
    ]

    # 시뮬레이션 실행
    success, message, output_files = run_simulation(
        room_coords=room_coords,
        robot_position=robot_position,
        robot_radius=request.robot_radius,
        microphones=microphones,
        audio_sources=audio_sources,
        audio_files=uploaded_files,
        scale=request.scale,
        output_dir=OUTPUT_DIR
    )

    return SimulationResponse(
        success=success,
        message=message,
        output_files=output_files
    )


@app.get("/download/{filename}")
async def download_file(filename: str):
    """
    결과 파일 다운로드
    """
    filepath = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        filepath,
        media_type="audio/wav",
        filename=filename
    )


@app.get("/uploaded-files")
def list_uploaded_files():
    """
    업로드된 파일 목록 (uploads 폴더 스캔)
    """
    # uploads 폴더의 실제 파일 목록 스캔
    files = []
    for f in os.listdir(UPLOAD_DIR):
        if f.endswith('.wav'):
            filepath = os.path.join(UPLOAD_DIR, f)
            files.append(f)
            # 메모리 딕셔너리에도 추가 (시뮬레이션에서 사용)
            if f not in uploaded_files:
                uploaded_files[f] = filepath
    return {"files": files}


@app.delete("/clear")
def clear_files():
    """
    업로드/출력 파일 모두 삭제
    """
    # uploads 폴더 비우기
    for f in os.listdir(UPLOAD_DIR):
        os.remove(os.path.join(UPLOAD_DIR, f))

    # outputs 폴더 비우기
    for f in os.listdir(OUTPUT_DIR):
        os.remove(os.path.join(OUTPUT_DIR, f))

    uploaded_files.clear()
    return {"message": "All files cleared"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
