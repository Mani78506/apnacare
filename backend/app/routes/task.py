from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.task import Task
from app.services.task_service import ensure_default_tasks

router = APIRouter(prefix="/task", tags=["Task"])


# ✅ 1. Create Default Tasks for a Booking
@router.post("/create/{booking_id}")
def create_tasks(booking_id: int, db: Session = Depends(get_db)):
    existing_tasks = db.query(Task).filter(Task.booking_id == booking_id).all()
    if existing_tasks:
        return {
            "message": "Tasks already exist for this booking",
            "tasks": [task.name for task in existing_tasks]
        }

    try:
        created_tasks = ensure_default_tasks(db, booking_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    db.commit()

    return {
        "message": "Tasks created successfully",
        "tasks": [t.name for t in created_tasks]
    }


# ✅ 2. Get Tasks for a Booking
@router.get("/{booking_id}")
def get_tasks(booking_id: int, db: Session = Depends(get_db)):
    tasks = db.query(Task).filter(Task.booking_id == booking_id).all()

    return tasks


# ✅ 3. Complete a Task
@router.post("/update/{task_id}")
def update_task(task_id: int, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()

    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.completed = True
    db.commit()

    return {
        "message": "Task marked as completed",
        "task_id": task_id
    }


# ✅ 4. Reset Tasks (Optional - useful for testing)
@router.delete("/reset/{booking_id}")
def reset_tasks(booking_id: int, db: Session = Depends(get_db)):
    tasks = db.query(Task).filter(Task.booking_id == booking_id).all()

    for task in tasks:
        task.completed = False

    db.commit()

    return {"message": "Tasks reset successfully"}
