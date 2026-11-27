from django.urls import path

from accounts import views

app_name = "accounts"

urlpatterns = [
    path("csrf/", views.csrf, name="csrf"),
    path("login/", views.login, name="login"),
    path("logout/", views.logout, name="logout"),
    path("me/", views.me, name="me"),
]
