from pydantic import BaseModel
from typing import List, Optional


class Point(BaseModel):
    """2D 좌표 (픽셀 단위)"""
    x: float
    y: float


class NormalizedPoint(BaseModel):
    """정규화된 좌표 (로봇 반지름 대비 비율)"""
    nx: float
    ny: float


class AudioSource(BaseModel):
    """음원 정보"""
    name: str
    position: Optional[Point] = None


class SimulationRequest(BaseModel):
    """시뮬레이션 요청 데이터"""
    # 방 꼭짓점 좌표 (픽셀)
    room_coords: List[Point]

    # 로봇 위치 (픽셀)
    robot_position: Point

    # 로봇 반지름 (픽셀)
    robot_radius: float

    # 마이크 위치들 (정규화된 좌표)
    microphones: List[NormalizedPoint]

    # 음원들 (이름 + 위치)
    audio_sources: List[AudioSource]

    # 픽셀 → 미터 변환 스케일 (기본값: 100px = 1m)
    scale: float = 100.0


class SimulationResponse(BaseModel):
    """시뮬레이션 결과"""
    success: bool
    message: str
    # 각 마이크별 결과 파일 경로
    output_files: List[str] = []
