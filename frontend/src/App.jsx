import React, { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Line, Circle } from 'react-konva';
import axios from 'axios';
import './App.css';
import './Palette.css';
import './MainContent.css';
import './BottomBars.css';

// 백엔드 API URL
const API_URL = 'http://localhost:8000';

const App = () => {
  // --- 상태(State) 관리 ---

  // 1. 현재 모드: 'IDLE'(대기), 'CREATING'(방 만드는중), 'PLACING_ROBOT'(로봇 놓는중)
  const [mode, setMode] = useState('IDLE');

  // 2. 방 데이터
  const [roomCoords, setRoomCoords] = useState([]); // 점들의 좌표 [{x,y}, ...]
  const [isRoomCreated, setIsRoomCreated] = useState(false); // 방 완성 여부

  // 3. 로봇 데이터
  const [robotPosition, setRobotPosition] = useState(null); // 배치된 로봇 위치 {x, y}
  const [ghostPosition, setGhostPosition] = useState(null); // 마우스 따라다니는 원 위치
  const [robotRadius, setRobotRadius] = useState(20); // 로봇 반지름 (기본값 20)

  // 4. 마이크 데이터
  // 마이크는 로봇 중심 기준 정규화된 좌표로 저장 (반지름 대비 비율)
  // 예: {nx: 0.5, ny: 0.25} -> 로봇 중심에서 반지름*0.5 오른쪽, 반지름*0.25 아래
  const [microphones, setMicrophones] = useState([]); // [{nx, ny}, ...]
  const [micGhostPosition, setMicGhostPosition] = useState(null); // 마이크 고스트 위치

  // 5. 음원 데이터 (file 객체도 저장)
  const [audioSources, setAudioSources] = useState([]); // [{name, file, position: {x,y} | null}, ...]
  const [showAudioDropzone, setShowAudioDropzone] = useState(false); // 드롭존 표시 여부
  const [placingAudioIndex, setPlacingAudioIndex] = useState(null); // 현재 배치 중인 음원 인덱스
  const [audioGhostPosition, setAudioGhostPosition] = useState(null); // 음원 고스트 위치

  // 6. 시뮬레이션 상태
  const [isSimulating, setIsSimulating] = useState(false); // 시뮬레이션 중 여부
  const [simResult, setSimResult] = useState(null); // 시뮬레이션 결과

  // 7. 오디오 재생 상태
  const audioRefs = useRef({}); // {filename: Audio object}
  const [playingStates, setPlayingStates] = useState({}); // {filename: boolean}
  const [loopStates, setLoopStates] = useState({}); // {filename: boolean}

  // 8. 캔버스 영역 ref (실제 크기 측정용)
  const canvasAreaRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // 9. 서버에 업로드된 파일 목록
  const [serverFiles, setServerFiles] = useState([]);

  // 10. DOA 시각화 상태 (각 알고리즘별)
  const [showSrpPlot, setShowSrpPlot] = useState(true); // SRP 표시 여부
  const [showMusicPlot, setShowMusicPlot] = useState(true); // MUSIC 표시 여부
  const [showTopsPlot, setShowTopsPlot] = useState(true); // TOPS 표시 여부

  // 음원 색상 배열 (순환 사용)
  const AUDIO_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
  ];

  // 상수
  const MIN_ROBOT_RADIUS = 20; // 최소 반지름

  // 방의 최대 반지름 계산 (방의 가장 작은 변의 절반)
  const getMaxRobotRadius = () => {
    if (roomCoords.length < 3) return MIN_ROBOT_RADIUS;

    const xs = roomCoords.map(p => p.x);
    const ys = roomCoords.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);

    // 방의 작은 변의 절반을 최대 반지름으로
    return Math.floor(Math.min(width, height) / 2);
  };

  // 점이 다각형 안에 있는지 확인 (Ray Casting 알고리즘)
  const isPointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;

      if (((yi > point.y) !== (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  // 점에서 선분까지의 최소 거리 계산
  const distanceToSegment = (point, p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lengthSquared = dx * dx + dy * dy;

    if (lengthSquared === 0) {
      return Math.sqrt((point.x - p1.x) ** 2 + (point.y - p1.y) ** 2);
    }

    let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    const nearestX = p1.x + t * dx;
    const nearestY = p1.y + t * dy;

    return Math.sqrt((point.x - nearestX) ** 2 + (point.y - nearestY) ** 2);
  };

  // 원이 다각형 안에 완전히 들어가 있는지 확인
  const isCircleInsidePolygon = (center, radius, polygon) => {
    // 1. 중심이 다각형 안에 있어야 함
    if (!isPointInPolygon(center, polygon)) return false;

    // 2. 원이 모든 벽과 충분히 떨어져 있어야 함
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const distance = distanceToSegment(center, p1, p2);
      if (distance < radius) return false;
    }

    return true;
  };

  // 화면 크기 바뀌면 캔버스 크기도 조절
  useEffect(() => {
    const handleResize = () => {
      // 캔버스 영역 실제 크기 측정
      if (canvasAreaRef.current) {
        setCanvasSize({
          width: canvasAreaRef.current.clientWidth,
          height: canvasAreaRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', handleResize);
    // 초기 크기 측정
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 하단 바 상태 변경 시 캔버스 크기 다시 측정
  useEffect(() => {
    if (canvasAreaRef.current) {
      // 약간의 지연 후 측정 (레이아웃 업데이트 대기)
      setTimeout(() => {
        if (canvasAreaRef.current) {
          setCanvasSize({
            width: canvasAreaRef.current.clientWidth,
            height: canvasAreaRef.current.clientHeight
          });
        }
      }, 50);
    }
  }, [robotPosition, simResult]);

  // 키보드 화살표로 로봇 이동
  const MOVE_STEP = 5; // 한 번에 이동하는 거리 (px)

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!robotPosition) return;

      // 화살표 키일 때만 처리
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;

      e.preventDefault(); // 페이지 스크롤 방지

      setRobotPosition(prev => {
        let newX = prev.x;
        let newY = prev.y;

        switch (e.key) {
          case 'ArrowUp':    newY -= MOVE_STEP; break;
          case 'ArrowDown':  newY += MOVE_STEP; break;
          case 'ArrowLeft':  newX -= MOVE_STEP; break;
          case 'ArrowRight': newX += MOVE_STEP; break;
        }

        // 경계 검사: 방 안에 있을 때만 이동
        const newPos = { x: newX, y: newY };
        if (isCircleInsidePolygon(newPos, robotRadius, roomCoords)) {
          return newPos;
        }
        return prev; // 벽에 부딪히면 이동 안함
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [robotPosition]);


  // --- 이벤트 핸들러 ---

  // '방 만들기' 버튼 클릭
  const handleRoomBtnClick = async () => {
    if (isRoomCreated) {
      // 이미 방이 있는데 다시 누르면 -> 리셋
      if (confirm("방을 초기화하고 새로 만드시겠습니까?")) {
        setRoomCoords([]);
        setIsRoomCreated(false);
        setRobotPosition(null); // 로봇도 함께 초기화
        setRobotRadius(MIN_ROBOT_RADIUS); // 로봇 크기도 초기화
        setMicrophones([]); // 마이크도 초기화
        setAudioSources([]); // 음원도 초기화
        setShowAudioDropzone(false);
        setSimResult(null); // 시뮬레이션 결과 초기화
        setMode('IDLE'); // IDLE 모드로 (방 만들기 버튼으로 표시)

        // 서버의 uploads/outputs 폴더 비우기
        try {
          await axios.delete(`${API_URL}/clear`);
        } catch (error) {
          console.error('Clear error:', error);
        }
      }
    } else {
      if (mode === 'IDLE') {
        // 시작: 방 만들기 모드로 진입
        setMode('CREATING');
        setRoomCoords([]);
      } else if (mode === 'CREATING') {
        // 완료: 방 만들기 종료
        if (roomCoords.length < 3) {
          alert("최소 3개의 점이 필요합니다!");
          return;
        }
        setMode('IDLE');
        setIsRoomCreated(true);
      }
    }
  };

  // '로봇 불러오기' 버튼 클릭
  const handleRobotBtnClick = () => {
    if (mode === 'IDLE' && isRoomCreated) {
      setMode('PLACING_ROBOT');
      setRobotPosition(null); // 기존 로봇 초기화
      setRobotRadius(MIN_ROBOT_RADIUS); // 크기도 초기화
      setMicrophones([]); // 마이크도 초기화
    }
  };

  // '마이크 불러오기/추가하기' 버튼 클릭
  const handleMicBtnClick = () => {
    if (mode === 'IDLE' && robotPosition) {
      setMode('PLACING_MIC');
    }
  };

  // '음원 불러오기' 버튼 클릭
  const handleAudioBtnClick = async () => {
    // 드롭존 토글
    const willShow = !showAudioDropzone;
    setShowAudioDropzone(willShow);

    // 드롭존을 열 때 서버의 uploads 폴더 파일 목록 가져오기
    if (willShow) {
      try {
        const response = await axios.get(`${API_URL}/uploaded-files`);
        const files = response.data.files || [];
        setServerFiles(files);
      } catch (error) {
        console.error('Failed to fetch uploaded files:', error);
        setServerFiles([]);
      }
    }
  };

  // 서버 파일 선택 (드롭존에서 파일 버튼 클릭)
  const handleServerFileSelect = (filename) => {
    // 이미 audioSources에 있는지 확인
    const existingIndex = audioSources.findIndex(a => a.name === filename);

    if (existingIndex >= 0) {
      // 이미 있으면 해당 음원 배치 모드로
      if (isRoomCreated) {
        setPlacingAudioIndex(existingIndex);
        setMode('PLACING_AUDIO');
        setShowAudioDropzone(false);
      }
    } else {
      // 없으면 새로 추가하고 배치 모드로
      const newSource = { name: filename, file: null, position: null };
      const newIndex = audioSources.length;
      setAudioSources([...audioSources, newSource]);

      if (isRoomCreated) {
        setPlacingAudioIndex(newIndex);
        setMode('PLACING_AUDIO');
        setShowAudioDropzone(false);
      }
    }
  };

  // 파일 드롭 핸들러
  const handleFileDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.wav'));
    if (files.length > 0) {
      // 파일 객체도 함께 저장
      const newSources = files.map(f => ({ name: f.name, file: f, position: null }));
      setAudioSources([...audioSources, ...newSources]);
    }
  };

  // 시뮬레이션 실행 가능 여부 확인
  const canSimulate = () => {
    return (
      isRoomCreated &&
      robotPosition &&
      microphones.length > 0 &&
      audioSources.some(a => a.position !== null)
    );
  };

  // 시뮬레이션 실행
  const handleSimulate = async () => {
    if (!canSimulate()) {
      alert('시뮬레이션을 위해 방, 로봇, 마이크, 음원이 모두 배치되어야 합니다.');
      return;
    }

    setIsSimulating(true);
    setSimResult(null);

    try {
      // 1. 오디오 파일 업로드 (로컬에서 드롭한 파일만)
      const placedSources = audioSources.filter(a => a.position !== null);
      const filesToUpload = placedSources.filter(source => source.file);

      if (filesToUpload.length > 0) {
        const formData = new FormData();
        filesToUpload.forEach(source => {
          formData.append('files', source.file);
        });

        await axios.post(`${API_URL}/upload-audio`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      // 2. 시뮬레이션 요청
      const response = await axios.post(`${API_URL}/simulate`, {
        room_coords: roomCoords,
        robot_position: robotPosition,
        robot_radius: robotRadius,
        microphones: microphones,
        audio_sources: audioSources.map(a => ({
          name: a.name,
          position: a.position
        })),
        scale: 100.0  // 100px = 1m
      });

      setSimResult(response.data);

      if (response.data.success) {
        alert(`시뮬레이션 완료! ${response.data.output_files.length}개의 결과 파일이 생성되었습니다.`);
      } else {
        alert(`시뮬레이션 실패: ${response.data.message}`);
      }
    } catch (error) {
      console.error('Simulation error:', error);
      alert(`오류 발생: ${error.message}`);
      setSimResult({ success: false, message: error.message, output_files: [] });
    } finally {
      setIsSimulating(false);
    }
  };

  // 파일 드래그 오버 핸들러
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // 음원 파일 클릭 -> 배치 모드
  const handleAudioFileClick = (index) => {
    if (mode === 'IDLE' && isRoomCreated) {
      setPlacingAudioIndex(index);
      setMode('PLACING_AUDIO');
    }
  };

  // 점이 원 안에 있는지 확인
  const isPointInCircle = (point, center, radius) => {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return (dx * dx + dy * dy) <= (radius * radius);
  };

  // 도화지 클릭 (점 찍기 또는 로봇 배치)
  const handleStageClick = (e) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    // 방 만들기 모드: 점 찍기
    if (mode === 'CREATING') {
      setRoomCoords([...roomCoords, { x: pointer.x, y: pointer.y }]);
      return;
    }

    // 로봇 배치 모드: 클릭한 위치에 로봇 배치
    if (mode === 'PLACING_ROBOT') {
      const newPos = { x: pointer.x, y: pointer.y };
      // 경계 검사: 방 안에만 배치 가능
      if (isCircleInsidePolygon(newPos, robotRadius, roomCoords)) {
        setRobotPosition(newPos);
        setGhostPosition(null);
        setMode('IDLE');
      }
      // 방 밖이면 배치 안됨 (계속 배치 모드 유지)
    }

    // 마이크 배치 모드: 로봇 원 안에만 배치 가능
    if (mode === 'PLACING_MIC' && robotPosition) {
      const clickPos = { x: pointer.x, y: pointer.y };
      if (isPointInCircle(clickPos, robotPosition, robotRadius)) {
        // 정규화된 좌표로 저장 (로봇 중심 기준, 반지름 대비 비율)
        const nx = (clickPos.x - robotPosition.x) / robotRadius;
        const ny = (clickPos.y - robotPosition.y) / robotRadius;
        setMicrophones([...microphones, { nx, ny }]);
        setMicGhostPosition(null);
        setMode('IDLE');
      }
    }

    // 음원 배치 모드: 방 안에만 배치 가능
    if (mode === 'PLACING_AUDIO' && placingAudioIndex !== null) {
      const clickPos = { x: pointer.x, y: pointer.y };
      if (isPointInPolygon(clickPos, roomCoords)) {
        const updated = [...audioSources];
        updated[placingAudioIndex].position = clickPos;
        setAudioSources(updated);
        setAudioGhostPosition(null);
        setPlacingAudioIndex(null);
        setMode('IDLE');
      }
    }
  };

  // 마우스 이동 (고스트 따라다니기)
  const handleStageMouseMove = (e) => {
    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();

    // 로봇 배치 모드
    if (mode === 'PLACING_ROBOT') {
      setGhostPosition({ x: pointer.x, y: pointer.y });
    }

    // 마이크 배치 모드
    if (mode === 'PLACING_MIC') {
      setMicGhostPosition({ x: pointer.x, y: pointer.y });
    }

    // 음원 배치 모드
    if (mode === 'PLACING_AUDIO') {
      setAudioGhostPosition({ x: pointer.x, y: pointer.y });
    }
  };

  // 마우스가 캔버스 밖으로 나가면 고스트 숨김
  const handleStageMouseLeave = () => {
    if (mode === 'PLACING_ROBOT') {
      setGhostPosition(null);
    }
    if (mode === 'PLACING_MIC') {
      setMicGhostPosition(null);
    }
    if (mode === 'PLACING_AUDIO') {
      setAudioGhostPosition(null);
    }
  };

  // --- 오디오 재생 관련 함수들 ---

  // 오디오 객체 가져오기 (없으면 생성)
  const getAudio = (filename) => {
    if (!audioRefs.current[filename]) {
      const audio = new Audio(`${API_URL}/download/${filename}`);
      audio.onended = () => {
        if (!audio.loop) {
          setPlayingStates(prev => ({ ...prev, [filename]: false }));
        }
      };
      audioRefs.current[filename] = audio;
    }
    return audioRefs.current[filename];
  };

  // 재생/일시정지 토글
  const togglePlay = (filename) => {
    const audio = getAudio(filename);
    if (playingStates[filename]) {
      audio.pause();
      setPlayingStates(prev => ({ ...prev, [filename]: false }));
    } else {
      // 다른 오디오 모두 정지
      Object.keys(audioRefs.current).forEach(key => {
        if (key !== filename) {
          audioRefs.current[key].pause();
          audioRefs.current[key].currentTime = 0;
        }
      });
      setPlayingStates(prev => {
        const newState = {};
        Object.keys(prev).forEach(key => { newState[key] = false; });
        newState[filename] = true;
        return newState;
      });
      audio.play();
    }
  };

  // 반복 재생 토글
  const toggleLoop = (filename) => {
    const audio = getAudio(filename);
    const newLoop = !loopStates[filename];
    audio.loop = newLoop;
    setLoopStates(prev => ({ ...prev, [filename]: newLoop }));
  };

  // 정지
  const stopAudio = (filename) => {
    const audio = getAudio(filename);
    audio.pause();
    audio.currentTime = 0;
    setPlayingStates(prev => ({ ...prev, [filename]: false }));
  };

  // 모든 오디오 정지 (컴포넌트 언마운트 시)
  useEffect(() => {
    return () => {
      Object.values(audioRefs.current).forEach(audio => {
        audio.pause();
      });
    };
  }, []);

  return (
    <div className="container">
      {/* 1. 왼쪽 팔레트 */}
      <div className="palette">
        <h2>🎨 Palette</h2>
        
        {/* 방 만들기 버튼 */}
        <button 
          className={`btn btn-room ${mode === 'CREATING' ? 'active' : ''}`}
          onClick={handleRoomBtnClick}
        >
          {/* 상태에 따라 버튼 글씨 바뀜 */}
          {isRoomCreated 
            ? "🔄 방 초기화" 
            : (mode === 'CREATING' ? "✅ 완료" : "🏠 방 만들기")}
        </button>

        {/* 로봇 불러오기 버튼 (방 없으면 비활성화) */}
        <button
          className={`btn btn-robot ${mode === 'PLACING_ROBOT' ? 'active' : ''}`}
          disabled={!isRoomCreated}
          onClick={handleRobotBtnClick}
        >
          {mode === 'PLACING_ROBOT' ? '📍 배치 중...' : '🤖 로봇 불러오기'}
        </button>

        {/* 마이크 불러오기/추가하기 버튼 (로봇 없으면 비활성화) */}
        <button
          className={`btn btn-mic ${mode === 'PLACING_MIC' ? 'active' : ''}`}
          disabled={!robotPosition}
          onClick={handleMicBtnClick}
        >
          {mode === 'PLACING_MIC'
            ? '📍 배치 중...'
            : (microphones.length > 0 ? '🎤 마이크 추가하기' : '🎤 마이크 불러오기')}
        </button>

        {/* 음원 불러오기 버튼 (방 없으면 비활성화) */}
        <button
          className={`btn btn-audio ${showAudioDropzone ? 'active' : ''}`}
          disabled={!isRoomCreated}
          onClick={handleAudioBtnClick}
        >
          🔊 음원 불러오기
        </button>

        {/* 음원 드롭존 (버튼 클릭 시 표시) */}
        {showAudioDropzone && (
          <div
            className="audio-dropzone"
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
          >
            {/* 서버에 이미 업로드된 파일 목록 */}
            {serverFiles.length > 0 && (
              <div className="server-files-list">
                <p className="server-files-title">📁 업로드된 파일</p>
                {serverFiles.map((filename, i) => {
                  const isAdded = audioSources.some(a => a.name === filename);
                  return (
                    <button
                      key={i}
                      className={`server-file-btn ${isAdded ? 'added' : ''}`}
                      onClick={() => handleServerFileSelect(filename)}
                    >
                      {isAdded ? '✓ ' : ''}{filename}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="dropzone-hint">WAV 파일을 여기에 드롭하세요</p>
          </div>
        )}

        {/* 업로드된 음원 리스트 */}
        {audioSources.length > 0 && (
          <div className="audio-list">
            {audioSources.map((audio, i) => (
              <div
                key={i}
                className={`audio-item ${placingAudioIndex === i ? 'placing' : ''} ${audio.position ? 'placed' : ''}`}
                style={{ backgroundColor: AUDIO_COLORS[i % AUDIO_COLORS.length] }}
                onClick={() => handleAudioFileClick(i)}
              >
                <span className="audio-number">{i + 1}</span>
                <span className="audio-name">{audio.name}</span>
                {audio.position && <span className="audio-check">✓</span>}
              </div>
            ))}
          </div>
        )}

        {/* 시뮬레이션 버튼 */}
        <button
          className={`btn btn-simulate ${isSimulating ? 'active' : ''}`}
          disabled={!canSimulate() || isSimulating}
          onClick={handleSimulate}
        >
          {isSimulating ? '⏳ 시뮬레이션 중...' : '🚀 시뮬레이션 실행'}
        </button>

        {/* 알고리즘별 토글 (시뮬레이션 결과가 있을 때) */}
        {simResult?.doa && (
          <div className="doa-control">
            <label className="algorithm-toggle srp">
              <input
                type="checkbox"
                checked={showSrpPlot}
                onChange={(e) => setShowSrpPlot(e.target.checked)}
              />
              <span>📡 SRP 표시</span>
            </label>
            <label className="algorithm-toggle music">
              <input
                type="checkbox"
                checked={showMusicPlot}
                onChange={(e) => setShowMusicPlot(e.target.checked)}
              />
              <span>📡 MUSIC 표시</span>
            </label>
            <label className="algorithm-toggle tops">
              <input
                type="checkbox"
                checked={showTopsPlot}
                onChange={(e) => setShowTopsPlot(e.target.checked)}
              />
              <span>📡 TOPS 표시</span>
            </label>
            {(showSrpPlot || showMusicPlot || showTopsPlot) && (
              <div className="doa-legend">
                <div className="legend-item">
                  <span className="legend-line legend-true"></span>
                  <span>실제 방향</span>
                </div>
                {showSrpPlot && (
                  <div className="legend-item">
                    <span className="legend-area" style={{backgroundColor: 'rgba(52, 152, 219, 0.3)', borderColor: '#3498db'}}></span>
                    <span>SRP 응답</span>
                  </div>
                )}
                {showMusicPlot && (
                  <div className="legend-item">
                    <span className="legend-area" style={{backgroundColor: 'rgba(230, 126, 34, 0.3)', borderColor: '#e67e22'}}></span>
                    <span>MUSIC 응답</span>
                  </div>
                )}
                {showTopsPlot && (
                  <div className="legend-item">
                    <span className="legend-area" style={{backgroundColor: 'rgba(155, 89, 182, 0.3)', borderColor: '#9b59b6'}}></span>
                    <span>TOPS 응답</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 원본 파일 재생 */}
        {audioSources.length > 0 && audioSources.some(a => a.file) && (
          <div className="sim-result">
            <p className="sim-result-title">🔊 원본 파일 재생</p>
            {audioSources.filter(a => a.file).map((audio, i) => (
              <button
                key={i}
                className={`audio-play-btn ${playingStates[`original_${i}`] ? 'playing' : ''}`}
                onClick={() => {
                  const key = `original_${i}`;
                  if (!audioRefs.current[key]) {
                    audioRefs.current[key] = new Audio(URL.createObjectURL(audio.file));
                    audioRefs.current[key].onended = () => {
                      setPlayingStates(prev => ({ ...prev, [key]: false }));
                    };
                  }
                  const audioEl = audioRefs.current[key];
                  if (playingStates[key]) {
                    audioEl.pause();
                    setPlayingStates(prev => ({ ...prev, [key]: false }));
                  } else {
                    // 다른 오디오 정지
                    Object.keys(audioRefs.current).forEach(k => {
                      audioRefs.current[k].pause();
                      audioRefs.current[k].currentTime = 0;
                    });
                    setPlayingStates(prev => {
                      const newState = {};
                      Object.keys(prev).forEach(k => { newState[k] = false; });
                      newState[key] = true;
                      return newState;
                    });
                    audioEl.play();
                  }
                }}
              >
                {playingStates[`original_${i}`] ? '⏸' : '▶'} 원본 음원 {i + 1}
              </button>
            ))}
          </div>
        )}

        {/* 상태 디버깅용 (개발 중에만 보임) */}
        <div style={{marginTop: 'auto', fontSize: '12px', color: '#666'}}>
          <p>Mode: {mode}</p>
          <p>Points: {roomCoords.length}</p>
        </div>
      </div>

      {/* 2. 오른쪽 도화지 + 하단바 영역 */}
      <div className="main-area">
        {/* 도화지 (Canvas) */}
        <div className="canvas-area" ref={canvasAreaRef}>
        <Stage
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleStageClick}
          onMouseMove={handleStageMouseMove}
          onMouseLeave={handleStageMouseLeave}
          style={{ cursor: mode === 'PLACING_ROBOT' ? 'none' : 'default' }}
        >
          <Layer>
            {/* 찍은 점들을 잇는 선 (미리보기) */}
            <Line
              points={roomCoords.flatMap(p => [p.x, p.y])}
              stroke="black"
              strokeWidth={2}
              closed={isRoomCreated} // 방이 완성되면 도형을 닫음
              fill={isRoomCreated ? "#e3f2fd" : null} // 완성되면 연한 파란색 채우기
            />

            {/* 찍은 점들 (빨간 점) */}
            {roomCoords.map((pos, i) => (
              <Circle
                key={i}
                x={pos.x}
                y={pos.y}
                radius={5}
                fill="red"
              />
            ))}

            {/* 고스트 원 (마우스 따라다니는 투명한 원) */}
            {mode === 'PLACING_ROBOT' && ghostPosition && (
              <Circle
                x={ghostPosition.x}
                y={ghostPosition.y}
                radius={robotRadius}
                stroke="black"
                strokeWidth={2}
                fill="transparent"
              />
            )}

            {/* DOA Polar Plot (시뮬레이션 결과가 있을 때) */}
            {robotPosition && simResult?.doa && (showSrpPlot || showMusicPlot || showTopsPlot) && (() => {
              const doa = simResult.doa;
              const plotRadius = robotRadius * 4; // polar plot 크기
              const cx = robotPosition.x;
              const cy = robotPosition.y;

              // 알고리즘별 색상
              const algoColors = {
                SRP: { stroke: '#3498db', fill: 'rgba(52, 152, 219, 0.2)' },
                MUSIC: { stroke: '#e67e22', fill: 'rgba(230, 126, 34, 0.2)' },
                TOPS: { stroke: '#9b59b6', fill: 'rgba(155, 89, 182, 0.2)' }
              };

              // 알고리즘별 표시 여부
              const algoShow = {
                SRP: showSrpPlot,
                MUSIC: showMusicPlot,
                TOPS: showTopsPlot
              };

              // spatial response를 polar 좌표로 변환하는 함수
              const getSpatialPoints = (algoName) => {
                const resp = doa.spatial_response[algoName];
                if (!resp || resp.length === 0) return [];
                return doa.azimuth_grid.map((angle, i) => {
                  const r = plotRadius * (0.3 + 0.7 * resp[i]); // 최소 30% 크기
                  return [
                    cx + r * Math.cos(angle),
                    cy - r * Math.sin(angle) // 캔버스 y축 반전
                  ];
                }).flat();
              };

              // 피크 찾기 함수
              const findPeaks = (values, numPeaks) => {
                if (!values || values.length === 0) return [];
                const peaks = [];
                for (let i = 1; i < values.length - 1; i++) {
                  if (values[i] > values[i - 1] && values[i] > values[i + 1] && values[i] > 0.5) {
                    peaks.push({ index: i, value: values[i] });
                  }
                }
                if (values[0] > values[values.length - 1] && values[0] > values[1] && values[0] > 0.5) {
                  peaks.push({ index: 0, value: values[0] });
                }
                return peaks.sort((a, b) => b.value - a.value).slice(0, numPeaks);
              };

              const numSources = doa.true_angles.length;

              return (
                <>
                  {/* 배경 원 (그리드) */}
                  <Circle
                    x={cx}
                    y={cy}
                    radius={plotRadius}
                    stroke="#ccc"
                    strokeWidth={1}
                    dash={[5, 5]}
                    fill="rgba(200, 200, 200, 0.1)"
                  />
                  <Circle
                    x={cx}
                    y={cy}
                    radius={plotRadius * 0.5}
                    stroke="#ddd"
                    strokeWidth={1}
                    dash={[3, 3]}
                  />

                  {/* 각 알고리즘별 Spatial Response 폴리라인 */}
                  {['SRP', 'MUSIC', 'TOPS'].map((algoName) => {
                    if (!algoShow[algoName]) return null;
                    const spatialPoints = getSpatialPoints(algoName);
                    if (spatialPoints.length === 0) return null;
                    return (
                      <Line
                        key={`spatial-${algoName}`}
                        points={spatialPoints}
                        stroke={algoColors[algoName].stroke}
                        strokeWidth={2}
                        closed={true}
                        fill={algoColors[algoName].fill}
                      />
                    );
                  })}

                  {/* 실제 음원 방향 (초록 점선) */}
                  {doa.true_angles.map((angle, i) => (
                    <Line
                      key={`true-${i}`}
                      points={[
                        cx, cy,
                        cx + plotRadius * 1.1 * Math.cos(angle),
                        cy - plotRadius * 1.1 * Math.sin(angle)
                      ]}
                      stroke="#2ecc71"
                      strokeWidth={3}
                      dash={[8, 4]}
                    />
                  ))}

                  {/* 각 알고리즘별 추정 방향 (화살표) */}
                  {['SRP', 'MUSIC', 'TOPS'].map((algoName) => {
                    if (!algoShow[algoName]) return null;
                    const resp = doa.spatial_response[algoName];
                    if (!resp || resp.length === 0) return null;
                    const peaks = findPeaks(resp, numSources * 2);
                    const peakAngles = peaks.map(p => doa.azimuth_grid[p.index]);

                    return peakAngles.map((angle, i) => {
                      const arrowSize = 10;
                      const arrowAngle = 0.4;
                      const endX = cx + plotRadius * 1.05 * Math.cos(angle);
                      const endY = cy - plotRadius * 1.05 * Math.sin(angle);

                      return (
                        <React.Fragment key={`est-${algoName}-${i}`}>
                          <Line
                            points={[cx, cy, endX, endY]}
                            stroke={algoColors[algoName].stroke}
                            strokeWidth={3}
                          />
                          <Line
                            points={[
                              endX, endY,
                              endX - arrowSize * Math.cos(angle - arrowAngle),
                              endY + arrowSize * Math.sin(angle - arrowAngle),
                              endX - arrowSize * Math.cos(angle + arrowAngle),
                              endY + arrowSize * Math.sin(angle + arrowAngle),
                              endX, endY
                            ]}
                            stroke={algoColors[algoName].stroke}
                            strokeWidth={2}
                            fill={algoColors[algoName].stroke}
                            closed={true}
                          />
                        </React.Fragment>
                      );
                    });
                  })}
                </>
              );
            })()}

            {/* 배치된 로봇 */}
            {robotPosition && (
              <Circle
                x={robotPosition.x}
                y={robotPosition.y}
                radius={robotRadius}
                stroke="black"
                strokeWidth={2}
                fill="rgba(100, 149, 237, 0.3)"
                draggable
                onDragMove={(e) => {
                  const newPos = { x: e.target.x(), y: e.target.y() };
                  // 경계 검사: 방 밖으로 나가면 원래 위치로 되돌림
                  if (!isCircleInsidePolygon(newPos, robotRadius, roomCoords)) {
                    e.target.x(robotPosition.x);
                    e.target.y(robotPosition.y);
                  }
                }}
                onDragEnd={(e) => {
                  const newPos = { x: e.target.x(), y: e.target.y() };
                  // 최종 위치가 유효하면 업데이트
                  if (isCircleInsidePolygon(newPos, robotRadius, roomCoords)) {
                    setRobotPosition(newPos);
                  } else {
                    // 무효하면 원래 위치로
                    e.target.x(robotPosition.x);
                    e.target.y(robotPosition.y);
                  }
                }}
                onMouseEnter={(e) => {
                  e.target.getStage().container().style.cursor = 'grab';
                }}
                onMouseLeave={(e) => {
                  e.target.getStage().container().style.cursor = 'default';
                }}
              />
            )}

            {/* 배치된 마이크들 (로봇 위에 표시) */}
            {robotPosition && microphones.map((mic, i) => (
              <Circle
                key={i}
                x={robotPosition.x + mic.nx * robotRadius}
                y={robotPosition.y + mic.ny * robotRadius}
                radius={4}
                fill="red"
              />
            ))}

            {/* 마이크 고스트 (마우스 따라다니는 빨간 점) */}
            {mode === 'PLACING_MIC' && micGhostPosition && (
              <Circle
                x={micGhostPosition.x}
                y={micGhostPosition.y}
                radius={4}
                fill="red"
                opacity={0.5}
              />
            )}

            {/* 배치된 음원들 */}
            {audioSources.map((audio, i) => (
              audio.position && (
                <Circle
                  key={`audio-${i}`}
                  x={audio.position.x}
                  y={audio.position.y}
                  radius={8}
                  fill={AUDIO_COLORS[i % AUDIO_COLORS.length]}
                  stroke="white"
                  strokeWidth={2}
                />
              )
            ))}

            {/* 음원 고스트 (마우스 따라다니는 점) */}
            {mode === 'PLACING_AUDIO' && audioGhostPosition && placingAudioIndex !== null && (
              <Circle
                x={audioGhostPosition.x}
                y={audioGhostPosition.y}
                radius={8}
                fill={AUDIO_COLORS[placingAudioIndex % AUDIO_COLORS.length]}
                stroke="white"
                strokeWidth={2}
                opacity={0.5}
              />
            )}
          </Layer>
        </Stage>
        </div>

        {/* 3. 하단 음원 구역 (시뮬레이션 완료 후 표시) */}
        {simResult && simResult.success && (
          <div className="audio-player-bar">
            {simResult.output_files.map((file) => {
              const isMixed = file.startsWith('mixed_');
              // source_1_xxx.wav -> "음원 1"
              const sourceMatch = file.match(/^source_(\d+)_/);
              const label = isMixed ? '전부 같이 듣기' : (sourceMatch ? `음원 ${sourceMatch[1]}` : file);
              return (
                <div key={file} className="audio-player-item">
                  <span className="audio-player-label">{label}</span>
                  <button
                    className={`audio-btn ${playingStates[file] ? 'playing' : ''}`}
                    onClick={() => togglePlay(file)}
                  >
                    {playingStates[file] ? '⏸ 일시정지' : '▶ 재생'}
                  </button>
                  <button
                    className={`audio-btn loop ${loopStates[file] ? 'active' : ''}`}
                    onClick={() => toggleLoop(file)}
                  >
                    🔁 반복
                  </button>
                  <button
                    className="audio-btn stop"
                    onClick={() => stopAudio(file)}
                  >
                    ⏹ 정지
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. 하단 로봇 상태 바 (로봇이 배치되었을 때만 표시) */}
        {robotPosition && (
          <div className="robot-status-bar">
            <span className="status-label">🤖 로봇 크기</span>
            <input
              type="range"
              min={MIN_ROBOT_RADIUS}
              max={getMaxRobotRadius()}
              value={robotRadius}
              onChange={(e) => setRobotRadius(Number(e.target.value))}
              className="size-slider"
            />
            <span className="size-value">지름: {robotRadius * 2}px</span>

            <span className="status-divider">|</span>

            <span className="status-label">📍 로봇 위치</span>
            <span className="position-value">
              X: {Math.round(robotPosition.x)}, Y: {Math.round(robotPosition.y)}
            </span>
          </div>
        )}
      </div>

    </div>
  );
};

export default App;