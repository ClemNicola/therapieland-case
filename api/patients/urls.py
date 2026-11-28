from rest_framework.routers import SimpleRouter

from patients.views import PatientViewSet

app_name = "patients"

router = SimpleRouter()
router.register("patients", PatientViewSet, basename="patient")

urlpatterns = router.urls
