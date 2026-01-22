import React, { useState, useEffect } from 'react';
import { Stage, Layer, Line, Circle } from 'react-konva';
import './App.css';

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

  // 상수
  const MIN_ROBOT_RADIUS = 20; // 최소 반지름
  const STATUS_BAR_HEIGHT = 60; // 하단 상태바 높이

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

  // 3. 윈도우 크기 (도화지 크기 맞춤용)
  const [dimensions, setDimensions] = useState({ 
    width: window.innerWidth - 250, // 팔레트 너비(250px) 뺌
    height: window.innerHeight 
  });

  // 화면 크기 바뀌면 도화지 크기도 조절
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth - 250,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  const handleRoomBtnClick = () => {
    if (isRoomCreated) {
      // 이미 방이 있는데 다시 누르면 -> 리셋
      if (confirm("방을 초기화하고 새로 만드시겠습니까?")) {
        setRoomCoords([]);
        setIsRoomCreated(false);
        setRobotPosition(null); // 로봇도 함께 초기화
        setRobotRadius(MIN_ROBOT_RADIUS); // 로봇 크기도 초기화
        setMode('CREATING');
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
    }
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
  };

  // 마우스 이동 (고스트 원 따라다니기)
  const handleStageMouseMove = (e) => {
    if (mode !== 'PLACING_ROBOT') return;

    const stage = e.target.getStage();
    const pointer = stage.getPointerPosition();
    setGhostPosition({ x: pointer.x, y: pointer.y });
  };

  // 마우스가 캔버스 밖으로 나가면 고스트 숨김
  const handleStageMouseLeave = () => {
    if (mode === 'PLACING_ROBOT') {
      setGhostPosition(null);
    }
  };


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

        {/* 상태 디버깅용 (개발 중에만 보임) */}
        <div style={{marginTop: 'auto', fontSize: '12px', color: '#666'}}>
          <p>Mode: {mode}</p>
          <p>Points: {roomCoords.length}</p>
        </div>
      </div>

      {/* 2. 오른쪽 도화지 + 하단바 영역 */}
      <div className="main-area">
        {/* 도화지 (Canvas) */}
        <div className="canvas-area">
        <Stage
          width={dimensions.width}
          height={robotPosition ? dimensions.height - STATUS_BAR_HEIGHT : dimensions.height}
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
          </Layer>
        </Stage>
        </div>

        {/* 3. 하단 로봇 상태 바 (로봇이 배치되었을 때만 표시) */}
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