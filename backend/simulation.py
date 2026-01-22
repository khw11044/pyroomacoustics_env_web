import numpy as np
import pyroomacoustics as pra
from scipy.io import wavfile
import os
import uuid
from typing import List, Tuple

# 고정 파라미터
FS = 16000           # 샘플링 레이트 (Hz)
MAX_ORDER = 3        # 반사 차수
ABSORPTION = 0.2     # 벽 흡음 계수
ROOM_HEIGHT = 2.5    # 방 높이 (m)
MIC_HEIGHT = 1.0     # 마이크 높이 (m)
SOURCE_HEIGHT = 1.0  # 음원 높이 (m)


def pixels_to_meters(coords: List[dict], scale: float) -> np.ndarray:
    """
    픽셀 좌표를 미터 좌표로 변환
    coords: [{"x": px, "y": py}, ...]
    scale: 픽셀/미터 비율 (예: 100 = 100px당 1m)
    반환: [[x1, x2, ...], [y1, y2, ...]] 형태의 numpy 배열
    """
    xs = [p["x"] / scale for p in coords]
    ys = [p["y"] / scale for p in coords]
    return np.array([xs, ys])


def run_simulation(
    room_coords: List[dict],
    robot_position: dict,
    robot_radius: float,
    microphones: List[dict],
    audio_sources: List[dict],
    audio_files: dict,  # {filename: file_path}
    scale: float = 100.0,
    output_dir: str = "outputs"
) -> Tuple[bool, str, List[str]]:
    """
    pyroomacoustics 시뮬레이션 실행

    Args:
        room_coords: 방 꼭짓점 좌표 [{"x": px, "y": py}, ...]
        robot_position: 로봇 중심 좌표 {"x": px, "y": py}
        robot_radius: 로봇 반지름 (픽셀)
        microphones: 정규화된 마이크 좌표 [{"nx": float, "ny": float}, ...]
        audio_sources: 음원 정보 [{"name": str, "position": {"x": px, "y": py}}, ...]
        audio_files: 업로드된 오디오 파일 경로 {filename: path}
        scale: 픽셀/미터 변환 비율
        output_dir: 결과 파일 저장 디렉토리

    Returns:
        (success, message, output_files)
    """
    try:
        os.makedirs(output_dir, exist_ok=True)

        # 1. 방 꼭짓점 좌표 변환 (픽셀 → 미터)
        corners = pixels_to_meters(room_coords, scale)

        # 2. 방 생성
        room = pra.Room.from_corners(
            corners,
            fs=FS,
            max_order=MAX_ORDER,
            materials=pra.Material(ABSORPTION, ABSORPTION),
            ray_tracing=True,
            air_absorption=True
        )

        # 3. 3D로 확장 (높이 2.5m)
        room.extrude(ROOM_HEIGHT, materials=pra.Material(ABSORPTION, ABSORPTION))

        # 4. 마이크 배열 설정
        if len(microphones) == 0:
            return False, "마이크가 배치되지 않았습니다.", []

        # 로봇 위치 (미터)
        robot_x = robot_position["x"] / scale
        robot_y = robot_position["y"] / scale
        robot_r = robot_radius / scale

        # 마이크 좌표 계산 (로봇 기준 상대 좌표 → 절대 좌표)
        mic_positions = []
        for mic in microphones:
            mx = robot_x + mic["nx"] * robot_r
            my = robot_y + mic["ny"] * robot_r
            mz = MIC_HEIGHT
            mic_positions.append([mx, my, mz])

        # numpy 배열로 변환 [[x1,x2,...], [y1,y2,...], [z1,z2,...]]
        R = np.array(mic_positions).T

        # 5. 각 음원별로 개별 시뮬레이션 실행
        output_files = []
        session_id = str(uuid.uuid4())[:8]
        all_source_signals = []
        max_length = 0
        source_index = 0

        for source in audio_sources:
            if source["position"] is None:
                continue

            # 음원 위치 변환
            src_x = source["position"]["x"] / scale
            src_y = source["position"]["y"] / scale
            src_z = SOURCE_HEIGHT

            # WAV 파일 로드
            filename = source["name"]
            if filename not in audio_files:
                continue

            try:
                sr, signal = wavfile.read(audio_files[filename])
                # 샘플레이트가 다르면 리샘플링
                if sr != FS:
                    ratio = FS / sr
                    new_length = int(len(signal) * ratio)
                    indices = np.linspace(0, len(signal) - 1, new_length).astype(int)
                    signal = signal[indices]

                # 스테레오면 모노로 변환
                if len(signal.shape) > 1:
                    signal = signal.mean(axis=1)

                # float으로 정규화
                signal = signal.astype(np.float32)
                if signal.max() > 1.0:
                    signal = signal / 32768.0

                # 이 음원만으로 새 방 생성 및 시뮬레이션
                single_room = pra.Room.from_corners(
                    corners,
                    fs=FS,
                    max_order=MAX_ORDER,
                    materials=pra.Material(ABSORPTION, ABSORPTION),
                    ray_tracing=True,
                    air_absorption=True
                )
                single_room.extrude(ROOM_HEIGHT, materials=pra.Material(ABSORPTION, ABSORPTION))
                single_room.add_source([src_x, src_y, src_z], signal=signal)
                single_room.add_microphone(R)
                single_room.image_source_model()
                single_room.simulate()

                # 모든 마이크 신호를 합쳐서 하나의 출력으로 (평균)
                mic_signals = single_room.mic_array.signals
                if len(mic_signals) > 1:
                    combined = np.mean(mic_signals, axis=0)
                else:
                    combined = mic_signals[0]

                # 정규화
                max_val = np.max(np.abs(combined))
                if max_val > 0:
                    combined = combined / max_val * 0.9

                all_source_signals.append(combined)
                max_length = max(max_length, len(combined))

                # int16으로 변환 및 저장
                combined_int = (combined * 32767).astype(np.int16)
                output_filename = f"source_{source_index + 1}_{session_id}.wav"
                output_path = os.path.join(output_dir, output_filename)
                wavfile.write(output_path, FS, combined_int)
                output_files.append(output_filename)
                source_index += 1

            except Exception as e:
                print(f"Error processing audio file {filename}: {e}")
                continue

        if len(output_files) == 0:
            return False, "배치된 음원이 없거나 오디오 파일을 로드할 수 없습니다.", []

        # 6. 모든 음원 신호 합치기 (mixed) - "전부 같이 듣기"
        if len(all_source_signals) > 1:
            # 길이 맞추기
            padded_signals = []
            for sig in all_source_signals:
                if len(sig) < max_length:
                    sig = np.pad(sig, (0, max_length - len(sig)))
                padded_signals.append(sig)

            # 합치기 (평균)
            mixed_signal = np.mean(padded_signals, axis=0)

            # 정규화
            max_val = np.max(np.abs(mixed_signal))
            if max_val > 0:
                mixed_signal = mixed_signal / max_val * 0.9

            # int16으로 변환
            mixed_signal_int = (mixed_signal * 32767).astype(np.int16)

            # 파일 저장
            mixed_filename = f"mixed_{session_id}.wav"
            mixed_path = os.path.join(output_dir, mixed_filename)
            wavfile.write(mixed_path, FS, mixed_signal_int)
            output_files.append(mixed_filename)

        return True, f"시뮬레이션 완료! {len(output_files)}개의 출력 생성", output_files

    except Exception as e:
        return False, f"시뮬레이션 오류: {str(e)}", []
